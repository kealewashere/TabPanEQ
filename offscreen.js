// Keyed by tabId. Holds the live Web Audio graph for each captured tab.
const tabAudio = {};

// 12-band graphic EQ center frequencies, low to high.
const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000];

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.target !== 'offscreen') return;

    switch (msg.type) {
        case 'capture_tab':
            captureTab(msg.tabId, msg.streamId, msg.panning, msg.volume, msg.eq);
            break;
        case 'update_audio':
            updateAudio(msg.tabId, msg.panning, msg.volume, msg.eq);
            break;
        case 'release_tab':
            releaseTab(msg.tabId);
            break;
    }
});

async function captureTab(tabId, streamId, panning, volume, eq) {
    // If the service worker restarted and lost its state but this document kept
    // running, the audio graph already exists — just update the values.
    if (tabAudio[tabId]) {
        updateAudio(tabId, panning, volume, eq);
        return;
    }

    // getUserMedia with chromeMediaSource:'tab' consumes the one-time streamId
    // obtained via chrome.tabCapture.getMediaStreamId() in the service worker.
    // Chrome mutes the tab's own audio output while this stream is active.
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId
            }
        },
        video: false
    });

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    // getUserMedia tab capture returns a stereo stream. StereoPannerNode's
    // stereo-in algorithm shifts the stereo field rather than panning, which
    // for correlated content (L≈R) reads as volume change instead of position.
    // Forcing the gain node to mono triggers the spec's speaker downmix
    // (0.5·L + 0.5·R) so the panner always receives a true mono signal.
    gainNode.channelCount = 1;
    gainNode.channelCountMode = 'explicit';
    gainNode.gain.setValueAtTime(volume, context.currentTime);
    const panNode = context.createStereoPanner();
    panNode.pan.setValueAtTime(panning, context.currentTime);

    const filters = EQ_BANDS.map((freq, i) => {
        const filter = context.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.setValueAtTime(freq, context.currentTime);
        filter.Q.setValueAtTime(1.4, context.currentTime);
        filter.gain.setValueAtTime(eq[i], context.currentTime);
        return filter;
    });

    let chain = gainNode;
    filters.forEach((filter) => {
        chain.connect(filter);
        chain = filter;
    });
    source.connect(gainNode);
    chain.connect(panNode).connect(context.destination);

    tabAudio[tabId] = { context, source, gainNode, panNode, filters };
}

function updateAudio(tabId, panning, volume, eq) {
    const audio = tabAudio[tabId];
    if (!audio) return;
    audio.panNode.pan.setValueAtTime(panning, audio.context.currentTime);
    audio.gainNode.gain.setValueAtTime(volume, audio.context.currentTime);
    audio.filters.forEach((filter, i) => {
        filter.gain.setValueAtTime(eq[i], audio.context.currentTime);
    });
}

function releaseTab(tabId) {
    const audio = tabAudio[tabId];
    if (!audio) return;
    audio.source.disconnect();
    audio.context.close();
    delete tabAudio[tabId];
}

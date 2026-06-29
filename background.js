const tabStates = {};
let creatingOffscreen = null;

// Restore panning/volume state that survived a service-worker restart.
// The offscreen document keeps the audio graph alive independently, so
// we only need to remember the user's last-set values.
chrome.storage.session.get('tabStates').then(({ tabStates: stored }) => {
    if (stored) Object.assign(tabStates, stored);
    // Backfill eq on state stored before this field existed.
    Object.values(tabStates).forEach((state) => {
        if (!state.eq) state.eq = Array(12).fill(0);
    });
});

function saveTabStates() {
    chrome.storage.session.set({ tabStates });
}

async function ensureOffscreenDocument() {
    const url = chrome.runtime.getURL('offscreen.html');
    const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [url]
    });
    if (existing.length > 0) return;

    // Guard against concurrent calls racing into createDocument.
    if (!creatingOffscreen) {
        creatingOffscreen = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
            justification: 'Process captured tab audio for stereo panning and volume control'
        }).finally(() => { creatingOffscreen = null; });
    }
    await creatingOffscreen;
}

async function applyAudio(tabId, state) {
    await ensureOffscreenDocument();

    if (!state.enabled) {
        // Mark enabled before the async gap so a second rapid request
        // takes the update_audio path rather than starting a second capture.
        state.enabled = true;
        saveTabStates();

        const streamId = await new Promise((resolve) =>
            chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, resolve)
        );

        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'capture_tab',
            tabId,
            streamId,
            panning: state.panning,
            volume: state.volume,
            eq: state.eq
        }).catch(() => {});
    } else {
        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'update_audio',
            tabId,
            panning: state.panning,
            volume: state.volume,
            eq: state.eq
        }).catch(() => {});
    }
}

chrome.runtime.onConnect.addListener((port) => {
    port.onMessage.addListener(async (msg) => {
        const tabId = msg.tabid;
        if (!tabId || tabId < 0) return;

        if (!tabStates[tabId]) {
            tabStates[tabId] = { panning: 0, volume: 1, eq: Array(12).fill(0), enabled: false };
        }
        const state = tabStates[tabId];

        if (msg.type === 'set_request') {
            state.panning = parseFloat(msg.value[0]);
            state.volume = parseFloat(msg.value[1]);
            saveTabStates();

            await applyAudio(tabId, state);
        } else if (msg.type === 'set_eq_request') {
            state.eq = msg.value.map(parseFloat);
            saveTabStates();

            await applyAudio(tabId, state);
        } else if (msg.type === 'update_request') {
            port.postMessage({
                type: 'update_response',
                value: [state.panning, state.volume],
                eq: state.eq,
                tabid: tabId
            });
        }
    });
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabStates[tabId]) {
        delete tabStates[tabId];
        saveTabStates();
        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'release_tab',
            tabId
        }).catch(() => {});
    }
});

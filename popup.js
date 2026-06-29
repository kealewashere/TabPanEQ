const port = chrome.runtime.connect({ name: 'Tab DJ' });

const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000];

function formatBandLabel(freq) {
    return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
}

function renderEqBands() {
    const container = document.getElementById('TabDJExtensionEqBands');
    EQ_BANDS.forEach((freq, i) => {
        const band = document.createElement('div');
        band.className = 'eq-band';
        band.innerHTML = `
            <span class="eq-band__label">${formatBandLabel(freq)}</span>
            <input type="range" class="eq-slider" min="-12" max="12" step="1" value="0" data-band="${i}">
            <span class="eq-band__value">0dB</span>
        `;
        container.appendChild(band);
    });
    container.addEventListener('input', setEqValue);
}

function getEqSliders() {
    return Array.from(document.querySelectorAll('#TabDJExtensionEqBands .eq-slider'));
}

function updateEqReadout(slider) {
    const value = Number(slider.value);
    slider.parentElement.querySelector('.eq-band__value').textContent = `${value > 0 ? '+' : ''}${value}dB`;
}

function setEqValue() {
    const sliders = getEqSliders();
    sliders.forEach(updateEqReadout);
    const eqvalue = sliders.map((slider) => slider.value);
    currenttabcallback((tabid) => {
        port.postMessage({ type: 'set_eq_request', value: eqvalue, tabid });
    });
}

function setupTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            buttons.forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
        });
    });
}

function currenttabcallback(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currTab = tabs[0];
        if (currTab) callback(currTab.id);
    });
}

function updateVolumeDisplay(gainvalue) {
    const display = document.getElementById('TabDJExtensionVolumeDisplay');
    display.textContent = `${Math.round(gainvalue * 100)}%`;
    display.style.setProperty('--volume', `${gainvalue * 100}%`);
}

function setvalue() {
    const panvalue = document.getElementById('TabDJExtensionPanInput').value;
    const gainvalue = document.getElementById('TabDJExtensionVolumeInput').value;
    updateVolumeDisplay(gainvalue);
    currenttabcallback((tabid) => {
        port.postMessage({ type: 'set_request', value: [panvalue, gainvalue], tabid });
    });
}

function update() {
    currenttabcallback((tabid) => {
        port.postMessage({ type: 'update_request', value: [0, 1], tabid });
    });
}

port.onMessage.addListener((msg) => {
    currenttabcallback((tabid) => {
        if (msg.tabid == tabid && msg.type === 'update_response') {
            document.getElementById('TabDJExtensionPanInput').value = msg.value[0];
            document.getElementById('TabDJExtensionVolumeInput').value = msg.value[1];
            updateVolumeDisplay(msg.value[1]);

            const eq = msg.eq || EQ_BANDS.map(() => 0);
            getEqSliders().forEach((slider, i) => {
                slider.value = eq[i];
                updateEqReadout(slider);
            });
        }
    });
});

function localizeHtmlPage() {
    const objects = document.getElementsByTagName('html');
    for (let j = 0; j < objects.length; j++) {
        const obj = objects[j];
        const valStrH = obj.innerHTML.toString();
        const valNewH = valStrH.replace(/__MSG_(\w+)__/g, (match, v1) =>
            v1 ? chrome.i18n.getMessage(v1) : ''
        );
        if (valNewH !== valStrH) obj.innerHTML = valNewH;
    }
}

localizeHtmlPage();
document.getElementById('TabDJExtensionPanInput').addEventListener('input', setvalue);
document.getElementById('TabDJExtensionVolumeInput').addEventListener('input', setvalue);
setupTabs();
renderEqBands();
document.getElementById('TabDJExtensionEqReset').addEventListener('click', () => {
    getEqSliders().forEach((slider) => { slider.value = 0; });
    setEqValue();
});

update();

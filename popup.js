const port = chrome.runtime.connect({ name: 'Tab DJ' });

function currenttabcallback(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currTab = tabs[0];
        if (currTab) callback(currTab.id);
    });
}

function updateVolumeDisplay(gainvalue) {
    document.getElementById('TabDJExtensionVolumeDisplay').textContent = `${Math.round(gainvalue * 100)}%`;
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

update();

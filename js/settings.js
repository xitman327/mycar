// ─── Device Settings (WiFi, Node-RED, Theme) ─────────────────────────

const settingsCharacteristicUuids = {
    wifi: [
        { ssid: '19b1001f-e8f2-537e-4f6c-d104768a1214', pass: '19b10020-e8f2-537e-4f6c-d104768a1214', enabled: '19b10021-e8f2-537e-4f6c-d104768a1214' },
        { ssid: '19b10022-e8f2-537e-4f6c-d104768a1214', pass: '19b10023-e8f2-537e-4f6c-d104768a1214', enabled: '19b10024-e8f2-537e-4f6c-d104768a1214' },
        { ssid: '19b10025-e8f2-537e-4f6c-d104768a1214', pass: '19b10026-e8f2-537e-4f6c-d104768a1214', enabled: '19b10027-e8f2-537e-4f6c-d104768a1214' },
        { ssid: '19b10028-e8f2-537e-4f6c-d104768a1214', pass: '19b10029-e8f2-537e-4f6c-d104768a1214', enabled: '19b1002a-e8f2-537e-4f6c-d104768a1214' }
    ],
    node: {
        url: '19b1002b-e8f2-537e-4f6c-d104768a1214',
        user: '19b1002c-e8f2-537e-4f6c-d104768a1214',
        pass: '19b1002d-e8f2-537e-4f6c-d104768a1214'
    },
    tripStartCondition: '19b1002e-e8f2-537e-4f6c-d104768a1214'
};

const TRIP_START_CONDITIONS = [
    { value: 0, label: 'ADAPT_VOLTAGE' },
    { value: 1, label: 'OBD_VOLTAGE' },
    { value: 2, label: 'ENG_RPM' },
    { value: 3, label: 'VEHECLE_SPEED' },
    { value: 4, label: 'GPS_SPEED' },
    { value: 5, label: 'GPS_POS_ALTERED' },
    { value: 6, label: 'DEBUG_FORCED' }
];

const wifiFieldIds = [
    { ssid: 'wifi1-ssid', pass: 'wifi1-pass', enabled: 'wifi1-enabled' },
    { ssid: 'wifi2-ssid', pass: 'wifi2-pass', enabled: 'wifi2-enabled' },
    { ssid: 'wifi3-ssid', pass: 'wifi3-pass', enabled: 'wifi3-enabled' },
    { ssid: 'wifi4-ssid', pass: 'wifi4-pass', enabled: 'wifi4-enabled' }
];

async function readTextCharacteristic(uuid) {
    const c = await bleService.getCharacteristic(uuid);
    const v = await c.readValue();
    return bleTextDecoder.decode(v).trim();
}

async function writeTextCharacteristic(uuid, text) {
    const c = await bleService.getCharacteristic(uuid);
    const data = bleTextEncoder.encode(text || '');
    if (c.writeValueWithoutResponse) {
        await c.writeValueWithoutResponse(data);
    } else {
        await c.writeValue(data);
    }
}

function showWifiConfig() {
    document.getElementById('wifi-config-overlay').style.display = 'flex';
}

function hideWifiConfig() {
    document.getElementById('wifi-config-overlay').style.display = 'none';
}

function showNodeRedConfig() {
    document.getElementById('nodered-config-overlay').style.display = 'flex';
}

function hideNodeRedConfig() {
    document.getElementById('nodered-config-overlay').style.display = 'none';
}

function hydrateTripStartSelect() {
    const select = document.getElementById('trip-start-condition');
    if (!select) return;
    select.innerHTML = TRIP_START_CONDITIONS.map(opt => {
        return `<option value="${opt.value}">${opt.label}</option>`;
    }).join('');
}

function applyTheme(mode) {
    const theme = mode || 'system';
    document.body.dataset.theme = theme;
    localStorage.setItem('ui_theme', theme);
    setMapTheme(theme);
}

function initThemeSelect() {
    const select = document.getElementById('theme-select');
    if (!select) return;
    const saved = localStorage.getItem('ui_theme') || 'system';
    select.value = saved;
    applyTheme(saved);
    select.addEventListener('change', () => applyTheme(select.value));
    if (window.matchMedia) {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener?.('change', () => {
            const current = localStorage.getItem('ui_theme') || 'system';
            if (current === 'system') setMapTheme('system');
        });
    }
}

async function readSettingsFromDevice() {
    if (!bleDevice || !bleDevice.gatt?.connected || !bleService) {
        showNotification('Connect BLE before reading settings.', 'warning');
        return;
    }

    try {
        await readWifiSettingsFromDevice();
        await readNodeSettingsFromDevice();

        const tripStart = await readTextCharacteristic(settingsCharacteristicUuids.tripStartCondition);
        const tripStartEl = document.getElementById('trip-start-condition');
        const tripStartNum = parseInt(tripStart || '0', 10);
        if (tripStartEl) tripStartEl.value = String(Number.isFinite(tripStartNum) ? tripStartNum : 0);

        showNotification('Settings loaded from device.', 'info', 2500);
    } catch (err) {
        console.error('Settings read failed', err);
        showNotification('Failed to read settings: ' + err.message, 'error', 4000);
    }
}

async function readNodeSettingsFromDevice() {
    if (!bleDevice || !bleDevice.gatt?.connected || !bleService) {
        showNotification('Connect BLE before reading Node-RED settings.', 'warning');
        return;
    }

    try {
        const nodeUrl = await readTextCharacteristic(settingsCharacteristicUuids.node.url);
        const nodeUser = await readTextCharacteristic(settingsCharacteristicUuids.node.user);
        const nodePass = await readTextCharacteristic(settingsCharacteristicUuids.node.pass);
        const nodeUrlEl = document.getElementById('node-url');
        const nodeUserEl = document.getElementById('node-user');
        const nodePassEl = document.getElementById('node-pass');
        if (nodeUrlEl) nodeUrlEl.value = nodeUrl;
        if (nodeUserEl) nodeUserEl.value = nodeUser;
        if (nodePassEl) nodePassEl.value = nodePass;
        showNotification('Node-RED settings loaded.', 'info', 2500);
    } catch (err) {
        console.error('Node-RED settings read failed', err);
        showNotification('Failed to read Node-RED settings: ' + err.message, 'error', 4000);
    }
}

async function readWifiSettingsFromDevice() {
    if (!bleDevice || !bleDevice.gatt?.connected || !bleService) {
        showNotification('Connect BLE before reading WiFi settings.', 'warning');
        return;
    }

    try {
        for (let i = 0; i < wifiFieldIds.length; i++) {
            const fields = wifiFieldIds[i];
            const uuids = settingsCharacteristicUuids.wifi[i];
            const ssid = await readTextCharacteristic(uuids.ssid);
            const pass = await readTextCharacteristic(uuids.pass);
            const enabled = await readTextCharacteristic(uuids.enabled);
            const ssidEl = document.getElementById(fields.ssid);
            const passEl = document.getElementById(fields.pass);
            const enabledEl = document.getElementById(fields.enabled);
            if (ssidEl) ssidEl.value = ssid;
            if (passEl) passEl.value = pass;
            if (enabledEl) enabledEl.checked = parseBoolInput(enabled);
        }
        showNotification('WiFi settings loaded.', 'info', 2500);
    } catch (err) {
        console.error('WiFi settings read failed', err);
        showNotification('Failed to read WiFi settings: ' + err.message, 'error', 4000);
    }
}

async function writeSettingsToDevice() {
    if (!bleDevice || !bleDevice.gatt?.connected || !bleService) {
        showNotification('Connect BLE before saving settings.', 'warning');
        return;
    }

    try {
        await writeWifiSettingsToDevice();
        await writeNodeSettingsToDevice();

        const tripStartEl = document.getElementById('trip-start-condition');
        const tripStartValue = tripStartEl ? String(tripStartEl.value || '0') : '0';
        await writeTextCharacteristic(settingsCharacteristicUuids.tripStartCondition, tripStartValue);

        showNotification('Settings saved to device.', 'info', 2500);
    } catch (err) {
        console.error('Settings write failed', err);
        showNotification('Failed to save settings: ' + err.message, 'error', 4000);
    }
}

async function writeNodeSettingsToDevice() {
    if (!bleDevice || !bleDevice.gatt?.connected || !bleService) {
        showNotification('Connect BLE before saving Node-RED settings.', 'warning');
        return;
    }

    try {
        const nodeUrlEl = document.getElementById('node-url');
        const nodeUserEl = document.getElementById('node-user');
        const nodePassEl = document.getElementById('node-pass');
        await writeTextCharacteristic(settingsCharacteristicUuids.node.url, nodeUrlEl ? nodeUrlEl.value : '');
        await writeTextCharacteristic(settingsCharacteristicUuids.node.user, nodeUserEl ? nodeUserEl.value : '');
        await writeTextCharacteristic(settingsCharacteristicUuids.node.pass, nodePassEl ? nodePassEl.value : '');
        showNotification('Node-RED settings saved.', 'info', 2500);
    } catch (err) {
        console.error('Node-RED settings write failed', err);
        showNotification('Failed to save Node-RED settings: ' + err.message, 'error', 4000);
    }
}

async function writeWifiSettingsToDevice() {
    if (!bleDevice || !bleDevice.gatt?.connected || !bleService) {
        showNotification('Connect BLE before saving WiFi settings.', 'warning');
        return;
    }

    try {
        for (let i = 0; i < wifiFieldIds.length; i++) {
            const fields = wifiFieldIds[i];
            const uuids = settingsCharacteristicUuids.wifi[i];
            const ssidEl = document.getElementById(fields.ssid);
            const passEl = document.getElementById(fields.pass);
            const enabledEl = document.getElementById(fields.enabled);
            await writeTextCharacteristic(uuids.ssid, ssidEl ? ssidEl.value : '');
            await writeTextCharacteristic(uuids.pass, passEl ? passEl.value : '');
            await writeTextCharacteristic(uuids.enabled, enabledEl && enabledEl.checked ? '1' : '0');
        }
        showNotification('WiFi settings saved.', 'info', 2500);
    } catch (err) {
        console.error('WiFi settings write failed', err);
        showNotification('Failed to save WiFi settings: ' + err.message, 'error', 4000);
    }
}

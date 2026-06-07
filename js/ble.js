// ─── BLE Connection & Diagnostics ────────────────────────────────────

let bleDevice = null;
let bleServer = null;
let bleService = null;
let diagnosticPollTimer = null;
let diagnosticReading = false;
const isAndroid = /Android/i.test(navigator.userAgent);
const bleServiceUuid = '19b10000-e8f2-537e-4f6c-d104768a1214';
const bleTextDecoder = new TextDecoder();
const bleTextEncoder = new TextEncoder();
const PID_CHUNK0_UUID = '19b1001d-e8f2-537e-4f6c-d104768a1214';
const PID_CHUNK1_UUID = '19b1001e-e8f2-537e-4f6c-d104768a1214';
let charCache = {};
const METRICS1_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';
const METRICS2_UUID = '19b10002-e8f2-537e-4f6c-d104768a1214';

const diagnosticPieces = {
    time: null,
    gpsFix: null,
    gpsSats: null,
    gpsSpeed: null,
    gpsPos: null,
    wifiStatus: null,
    ip: null,
    signal: null,
    obdProtocol: null,
    uploadStage: null,
    uploadInProgress: null,
    uploadCurrentIdx: null,
    uploadFiles: null,
    logStatus: null,
    tripDistance: null,
    points: null,
    startTs: null,
    carEngOn: null,
    rpm: null,
    kmph: null,
    gpsKmph: null,
    temp: null,
    fuel: null,
    batt: null,
    lpg: null,
    vin: null,
    ramFreeKb: null,
    ramTotalKb: null,
    ramUsedPct: null
};

const diagnosticData = {
    time: '--',
    gpsFix: '--',
    gpsSats: '--',
    gpsSpeed: '--',
    gpsPos: null,
    wifi: '--',
    ip: '--',
    signal: '--',
    obd: '--',
    upload: '--',
    log: '--',
    car: '--',
    batt: '--',
    vin: '--',
    ram: '--'
};

// BLE Diagnostics Helpers
function setBleStatus(text, tone = 'secondary') {
    const statusText = document.getElementById('ble-status-text');
    const statusDot = document.getElementById('ble-status-dot');
    const statusText_pid = document.getElementById('ble-status-text-pid');
    const statusDot_pid = document.getElementById('ble-status-dot-pid');
    const badge = document.getElementById('ble-connection-badge');
    const toneClass = tone === 'warning' ? 'bg-warning text-dark' : `bg-${tone}`;

    if (statusText) statusText.textContent = text;
    if (statusDot) statusDot.className = `status-dot ${toneClass}`;
    if (statusText_pid) statusText_pid.textContent = text;
    if (statusDot_pid) statusDot_pid.className = `status-dot ${toneClass}`;
    if (badge) badge.className = `badge ${toneClass}`;
    if (badge) badge.textContent = text;
}

function logBle(message) {
    const logEl = document.getElementById('ble-log');
    if (!logEl) return;
    const now = new Date().toLocaleTimeString();
    const formatted = `[${now}] ${message}`;
    if (logEl.textContent === 'Waiting for data...') {
        logEl.textContent = '';
    }
    logEl.textContent += formatted + '\n';
    logEl.scrollTop = logEl.scrollHeight;
}

function setBleControls({ connected = false, connecting = false } = {}) {
    const connectBtn = document.getElementById('ble-connect-btn');
    const disconnectBtn = document.getElementById('ble-disconnect-btn');
    const connectBtnConfig = document.getElementById('ble-connect-btn-config');
    const disconnectBtnConfig = document.getElementById('ble-disconnect-btn-config');
    const sendBtn = document.getElementById('ble-send-btn');

    if (connectBtn) connectBtn.disabled = connecting || connected;
    if (disconnectBtn) disconnectBtn.disabled = !connected;
    if (connectBtnConfig) connectBtnConfig.disabled = connecting || connected;
    if (disconnectBtnConfig) disconnectBtnConfig.disabled = !connected;
    if (sendBtn) sendBtn.disabled = !connected;
}

async function ensureCharacteristic(uuid) {
    if (charCache[uuid]) return charCache[uuid];
    if (!bleService) throw new Error('Service not found');
    const char = await bleService.getCharacteristic(uuid);
    charCache[uuid] = char;
    return char;
}

async function connectBle() {
    const serviceUuid = bleServiceUuid;
    if (!navigator.bluetooth) {
        alert('Web Bluetooth API is not supported in this browser.');
        return;
    }

    setBleStatus('Searching...', 'warning');
    setBleControls({ connecting: true });

    try {
        const available = await navigator.bluetooth.getAvailability?.();
        if (available === false) {
            alert('Bluetooth not available. On Android, enable Bluetooth and Location, and use Chrome.');
            setBleControls({ connected: false });
            setBleStatus('Disconnected', 'secondary');
            return;
        }

        if (!bleDevice) {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: false,
                filters: [
                    { services: [serviceUuid] }
                ],
                optionalServices: [serviceUuid]
            });
            bleDevice = device;
            bleDevice.addEventListener('gattserverdisconnected', handleBleDisconnect);
        }

        if (!bleDevice.gatt.connected) {
            bleServer = await bleDevice.gatt.connect();
        } else {
            bleServer = bleDevice.gatt;
        }

        bleService = await bleServer.getPrimaryService(serviceUuid);

        document.getElementById('ble-device-name').textContent = bleDevice.name || 'Unnamed device';
        setBleStatus('Connected', 'success');
        setBleControls({ connected: true });
        logBle('Connected. Fetching data...');

        await fetchDiagnosticsFromCharacteristics();
        await syncPidListFromDevice();

        startDiagnosticPolling();
    } catch (error) {
        console.error('BLE connect error', error);
        logBle(`Connection failed: ${error.message}`);
        setBleStatus('Disconnected', 'secondary');
        setBleControls({ connected: false });
        bleService = null;
        stopDiagnosticPolling();
    }
}

async function disconnectBle() {
    if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
    }

    bleDevice = null;
    bleServer = null;
    bleService = null;
    stopDiagnosticPolling();
    resetPidState();
    document.getElementById('ble-device-name').textContent = 'None';
    setBleStatus('Disconnected', 'secondary');
    setBleControls({ connected: false });
    logBle('Disconnected');
}

function handleBleDisconnect() {
    logBle('Device disconnected');
    charCache = {};
    setBleStatus('Disconnected', 'secondary');
    setBleControls({ connected: false });
    bleServer = null;
    bleDevice = null;
    bleService = null;
    stopDiagnosticPolling();
    resetPidState();
    clearLiveCarMarker();
}

async function sendBleCommand(command) {
    if (!bleService || !bleDevice || !bleDevice.gatt.connected) {
        logBle('Not connected');
        return;
    }
    logBle('sendBleCommand is not implemented with the new characteristic structure.');
}

function renderDiagnosticData() {
    const mapVals = {
        'diag-time': diagnosticData.time,
        'diag-gps-fix': diagnosticData.gpsFix,
        'diag-gps-sats': diagnosticData.gpsSats,
        'diag-gps-speed': diagnosticData.gpsSpeed,
        'diag-wifi': diagnosticData.wifi,
        'diag-ip': diagnosticData.ip,
        'diag-signal': diagnosticData.signal,
        'diag-obd': diagnosticData.obd,
        'diag-upload': diagnosticData.upload,
        'diag-log': diagnosticData.log,
        'diag-car': diagnosticData.car,
        'diag-batt': diagnosticData.vin,
        'diag-ram': diagnosticData.ram
    };
    Object.entries(mapVals).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = val || '--';
            const card = el.closest('.diag-card');
            if (card) {
                card.classList.remove('live-blink');
                void card.offsetWidth;
                card.classList.add('live-blink');
                setTimeout(() => card.classList.remove('live-blink'), 400);
            }
        }
    });
}

async function fetchDiagnosticsFromCharacteristics() {
    if (!bleService || diagnosticReading) return;
    diagnosticReading = true;

    try {
        const [c1, c2] = await Promise.all([
            ensureCharacteristic(METRICS1_UUID),
            ensureCharacteristic(METRICS2_UUID)
        ]);

        const v1 = await c1.readValue();
        const v2 = await c2.readValue();

        const data1 = JSON.parse(bleTextDecoder.decode(v1));
        const data2 = JSON.parse(bleTextDecoder.decode(v2));

        diagnosticPieces.time = data1.time;
        if (data1.gps) {
            diagnosticPieces.gpsFix = data1.gps.fix ? '1' : '0';
            diagnosticPieces.gpsSats = data1.gps.sats;
            diagnosticPieces.gpsSpeed = data1.gps.speed;
            diagnosticPieces.gpsPos = data1.gps.pos;
        }
        if (data1.wifi) {
            diagnosticPieces.wifiStatus = data1.wifi.status ? '1' : '0';
            diagnosticPieces.ip = data1.wifi.ip;
            diagnosticPieces.signal = data1.wifi.signal + '%';
        }
        diagnosticPieces.obdProtocol = data1.obd_protocol;
        if (data1.upload) {
            diagnosticPieces.uploadStage = data1.upload.stage;
            diagnosticPieces.uploadInProgress = data1.upload.in_progress ? '1' : '0';
            diagnosticPieces.uploadCurrentIdx = data1.upload.current_idx;
            diagnosticPieces.uploadFiles = data1.upload.files;
        }
        if (data1.log) {
            diagnosticPieces.logStatus = data1.log.started ? '1' : '0';
            diagnosticPieces.tripDistance = data1.log.trip_dist;
            diagnosticPieces.points = data1.log.points;
            diagnosticPieces.startTs = data1.log.start_ts;
        }

        if (data2.car) {
            diagnosticPieces.carEngOn = data2.car.eng_on ? '1' : '0';
            diagnosticPieces.rpm = data2.car.rpm;
            diagnosticPieces.kmph = data2.car.kmph;
            diagnosticPieces.gpsKmph = data2.car.gps_kmph;
            diagnosticPieces.temp = data2.car.temp;
            diagnosticPieces.fuel = data2.car.fuel;
            diagnosticPieces.batt = data2.car.batt;
            diagnosticPieces.vin = data2.car.vin;
            diagnosticPieces.lpg = data2.car.lpg ? '1' : '0';
        }
        if (data2.ram) {
            diagnosticPieces.ramFreeKb = data2.ram.free_kb;
            diagnosticPieces.ramTotalKb = data2.ram.total_kb;
            diagnosticPieces.ramUsedPct = data2.ram.used_pct;
        }

        composeDiagnosticData();
        renderDiagnosticData();
    } catch (err) {
        console.warn('Failed to fetch or parse diagnostics JSON', err);
    } finally {
        diagnosticReading = false;
    }
}

function startDiagnosticPolling() {
    stopDiagnosticPolling();
    diagnosticPollTimer = setInterval(() => {
        if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
            fetchDiagnosticsFromCharacteristics();
        }
    }, LIVE_CAR_UPDATE_INTERVAL);
}

function stopDiagnosticPolling() {
    if (diagnosticPollTimer) {
        clearInterval(diagnosticPollTimer);
        diagnosticPollTimer = null;
    }
}

function humanizeDiagnosticTime(value) {
    if (!value) return 'N/A';
    const num = Number(value);
    if (Number.isFinite(num)) {
        const epochMs = num > 1e12 ? num : num * 1000;
        const date = new Date(epochMs);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed.toLocaleString();
    return String(value);
}

function composeDiagnosticData() {
    diagnosticData.time = humanizeDiagnosticTime(diagnosticPieces.time || diagnosticData.time);
    diagnosticData.gpsFix = diagnosticPieces.gpsFix;
    diagnosticData.gpsSats = diagnosticPieces.gpsSats || diagnosticData.gpsSats;
    diagnosticData.gpsSpeed = diagnosticPieces.gpsSpeed ? `${diagnosticPieces.gpsSpeed} km/h` : diagnosticData.gpsSpeed;
    diagnosticData.wifi = diagnosticPieces.wifiStatus || diagnosticData.wifi;
    diagnosticData.ip = diagnosticPieces.ip || diagnosticData.ip;
    diagnosticData.signal = diagnosticPieces.signal || diagnosticData.signal;
    diagnosticData.obd = diagnosticPieces.obdProtocol || diagnosticData.obd;

    const upStage = diagnosticPieces.uploadStage;
    const upProg = diagnosticPieces.uploadInProgress;
    const upIdx = diagnosticPieces.uploadCurrentIdx;
    const upFiles = diagnosticPieces.uploadFiles;
    if (upStage || upProg || upIdx || upFiles) {
        diagnosticData.upload = `Stage ${upStage ?? '-'} | in_progress ${upProg ?? '-'} | idx ${upIdx ?? '-'} | files ${upFiles ?? '-'}`;
    }

    const logStatus = diagnosticPieces.logStatus;
    const tripDist = diagnosticPieces.tripDistance;
    const points = diagnosticPieces.points;
    const startTs = diagnosticPieces.startTs;
    if (logStatus || tripDist || points || startTs) {
        diagnosticData.log = `${logStatus ?? '-'} | dist ${tripDist ?? '-'} km | points ${points ?? '-'} | start ${startTs ?? '-'}`;
    }

    const gpsPosParsed = parseGpsPosition(diagnosticPieces.gpsPos);
    if (gpsPosParsed) {
        diagnosticData.gpsPos = gpsPosParsed;
    }

    const car = diagnosticPieces;
    if (car.rpm || car.kmph || car.gpsKmph || car.temp || car.fuel || car.lpg || car.carEngOn) {
        diagnosticData.car = `eng:${car.carEngOn ?? '-'} rpm:${car.rpm ?? '-'} kmph:${car.kmph ?? '-'} temp:${car.temp ?? '-'}C fuel:${car.fuel ?? '-'}% lpg:${car.lpg ?? '-'}`;
    }
    if (car.batt) diagnosticData.batt = `${car.batt} V`;
    if (car.vin) diagnosticData.vin = `${car.vin} V`;

    if (car.ramFreeKb || car.ramTotalKb || car.ramUsedPct) {
        diagnosticData.ram = `${car.ramFreeKb ?? '-'}KB / ${car.ramTotalKb ?? '-'}KB (${car.ramUsedPct ?? '-'}% used)`;
    }

    updateLiveCarMarkerIfNeeded();
}

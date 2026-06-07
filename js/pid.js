// ─── PID Configuration ───────────────────────────────────────────────

const PID_NAMES = {
    0x00: 'Supported PIDs 00-1F',
    0x01: 'Monitor status since DTC clear',
    0x02: 'Freeze DTC',
    0x03: 'Fuel system status',
    0x04: 'Calculated engine load',
    0x05: 'Engine coolant temperature',
    0x06: 'Short-term fuel trim Bank 1',
    0x07: 'Long-term fuel trim Bank 1',
    0x08: 'Short-term fuel trim Bank 2',
    0x09: 'Long-term fuel trim Bank 2',
    0x0A: 'Fuel pressure',
    0x0B: 'Intake manifold absolute pressure',
    0x0C: 'Engine RPM',
    0x0D: 'Vehicle speed',
    0x0E: 'Timing advance',
    0x0F: 'Intake air temperature',
    0x10: 'MAF air flow rate',
    0x11: 'Throttle position',
    0x12: 'Commanded secondary air',
    0x13: 'O2 sensors present (banks 1-2)',
    0x14: 'O2 S1 B1 voltage / STFT',
    0x15: 'O2 S2 B1 voltage / STFT',
    0x16: 'O2 S3 B1 voltage / STFT',
    0x17: 'O2 S4 B1 voltage / STFT',
    0x18: 'O2 S1 B2 voltage / STFT',
    0x19: 'O2 S2 B2 voltage / STFT',
    0x1A: 'O2 S3 B2 voltage / STFT',
    0x1B: 'O2 S4 B2 voltage / STFT',
    0x1C: 'OBD standard the vehicle conforms to',
    0x1D: 'O2 sensors present (banks)',
    0x1E: 'Auxiliary input status',
    0x1F: 'Run time since engine start',
    0x20: 'Supported PIDs 21-40',
    0x21: 'Distance traveled with MIL on',
    0x22: 'Fuel rail pressure (vacuum reference)',
    0x23: 'Fuel rail gauge pressure (diesel/direct)',
    0x24: 'O2 S1 wideband lambda (eq ratio / V)',
    0x25: 'O2 S2 wideband lambda (eq ratio / V)',
    0x26: 'O2 S3 wideband lambda (eq ratio / V)',
    0x27: 'O2 S4 wideband lambda (eq ratio / V)',
    0x28: 'O2 S5 wideband lambda (eq ratio / V)',
    0x29: 'O2 S6 wideband lambda (eq ratio / V)',
    0x2A: 'O2 S7 wideband lambda (eq ratio / V)',
    0x2B: 'O2 S8 wideband lambda (eq ratio / V)',
    0x2C: 'Commanded EGR',
    0x2D: 'EGR error',
    0x2E: 'Commanded evaporative purge',
    0x2F: 'Fuel level input',
    0x30: 'Warm-ups since DTC clear',
    0x31: 'Distance traveled since DTC clear',
    0x32: 'Evap system vapor pressure',
    0x33: 'Barometric pressure',
    0x34: 'O2 S1 wideband lambda (current)',
    0x35: 'O2 S2 wideband lambda (current)',
    0x36: 'O2 S3 wideband lambda (current)',
    0x37: 'O2 S4 wideband lambda (current)',
    0x38: 'O2 S5 wideband lambda (current)',
    0x39: 'O2 S6 wideband lambda (current)',
    0x3A: 'O2 S7 wideband lambda (current)',
    0x3B: 'O2 S8 wideband lambda (current)',
    0x3C: 'Catalyst temperature B1S1',
    0x3D: 'Catalyst temperature B2S1',
    0x3E: 'Catalyst temperature B1S2',
    0x3F: 'Catalyst temperature B2S2',
    0x40: 'Supported PIDs 41-60',
    0x41: 'Monitor status this drive cycle',
    0x42: 'Control module voltage',
    0x43: 'Absolute load value',
    0x44: 'Commanded equivalence ratio',
    0x45: 'Relative throttle position',
    0x46: 'Ambient air temperature',
    0x47: 'Absolute throttle position B',
    0x48: 'Absolute throttle position C',
    0x49: 'Accelerator pedal position D',
    0x4A: 'Accelerator pedal position E',
    0x4B: 'Accelerator pedal position F',
    0x4C: 'Commanded throttle actuator',
    0x4D: 'Time run with MIL on',
    0x4E: 'Time since DTCs cleared',
    0x4F: 'Max values for eq ratio, O2, MAP',
    0x50: 'Fuel type',
    0x51: 'Ethanol fuel percentage',
    0x52: 'Absolute evap system vapor pressure',
    0x53: 'Evap system vapor pressure',
    0x54: 'ST secondary O2 trim B1/B3',
    0x55: 'LT secondary O2 trim B1/B3',
    0x56: 'ST secondary O2 trim B2/B4',
    0x57: 'LT secondary O2 trim B2/B4',
    0x58: 'Fuel rail absolute pressure',
    0x59: 'Relative accelerator pedal position',
    0x5A: 'Hybrid battery pack remaining life',
    0x5B: 'Engine oil temperature',
    0x5C: 'Fuel injection timing',
    0x5D: 'Engine fuel rate',
    0x5E: 'Emission requirements (design)',
    0x5F: 'GM proprietary / reserved (0x5F)',
    0x60: 'Supported PIDs 61-80',
    0x61: 'Driver demand engine percent torque',
    0x62: 'Actual engine percent torque',
    0x63: 'Engine reference torque',
    0x64: 'Engine percent torque data (idle/points)',
    0x65: 'Aux input/output supported (GM)',
    0x66: 'Mass air flow sensor high-res (GM)',
    0x67: 'Engine coolant temp high-res (GM)',
    0x68: 'Intake air temp high-res (GM)',
    0x69: 'Commanded EGR / EGR error (GM)',
    0x6A: 'Evap purge flow (GM)',
    0x6B: 'Turbo / supercharger boost (GM)',
    0x6C: 'Charge air cooler outlet temp (GM)',
    0x6D: 'Exhaust gas temperature sensor (GM)',
    0x6E: 'Diesel particulate filter temp/pressure (GM)',
    0x6F: 'Engine friction percent torque',
    0x70: 'GM proprietary / reserved (0x70)',
    0xc9: 'Adapter Temperature',
    0xcA: 'Adapter Humidity',
    0xcc: 'Adapter Voltage'
};

const BASE_PID_MAX = 0x70;
const basePids = Array.from({ length: BASE_PID_MAX + 1 }, (_, value) => value);
const namedPids = Object.keys(PID_NAMES)
    .map(k => parseInt(k, 0))
    .filter(n => !Number.isNaN(n));
const PID_OPTIONS = Array.from(new Set([...basePids, ...namedPids]))
    .sort((a, b) => a - b)
    .map(value => {
        const hex = value.toString(16).padStart(2, '0').toUpperCase();
        const name = PID_NAMES[value] || `PID ${hex}`;
        return { value, label: `${hex} - ${name}` };
    });

let pidChunk0 = null;
let pidChunk1 = null;
let pidRequestList = new Uint8Array(40);
let pidList = [];

function pidLabel(pidVal) {
    const match = PID_OPTIONS.find(p => p.value === pidVal);
    const hex = pidVal.toString(16).padStart(2, '0').toUpperCase();
    return match ? match.label : `${hex} - PID`;
}

function updatePidBadge() {
    const badge = document.getElementById('pid-count-badge');
    if (badge) badge.textContent = `${pidList.length}/40`;
}

function renderPidList() {
    const listEl = document.getElementById('pid-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!pidList.length) {
        listEl.innerHTML = '<div class="pid-empty">No PIDs yet.</div>';
        updatePidBadge();
        return;
    }

    pidList.forEach((pidVal, index) => {
        const pill = document.createElement('div');
        pill.className = 'pid-pill';
        pill.innerHTML = `
                    <span>${pidLabel(pidVal)}</span>
                    <button aria-label="Remove PID" data-idx="${index}">&times;</button>
                `;
        pill.querySelector('button').addEventListener('click', async (e) => {
            e.stopPropagation();
            pidList.splice(index, 1);
            renderPidList();
            await writePidListToDevice();
        });
        listEl.appendChild(pill);
    });
    updatePidBadge();
}

function hydratePidSelect() {
    const select = document.getElementById('pid-select');
    if (!select) return;
    select.innerHTML = PID_OPTIONS.map(opt => {
        const hex = opt.value.toString(16).padStart(2, '0').toUpperCase();
        return `<option value="${hex}">${opt.label}</option>`;
    }).join('');
}

async function handlePidAdd() {
    const select = document.getElementById('pid-select');
    if (!select) return;
    const pidVal = parseInt(select.value, 16);
    if (Number.isNaN(pidVal)) return;
    if (pidList.length >= 40) {
        showNotification('PID list is full (40 bytes).', 'warning');
        return;
    }
    if (pidList.includes(pidVal)) {
        showNotification('PID already in the list.', 'warning');
        return;
    }
    pidList.push(pidVal & 0xFF);
    renderPidList();
    await writePidListToDevice();
}

async function ensurePidCharacteristics() {
    if (!bleService) throw new Error('BLE service not ready');
    if (!pidChunk0) pidChunk0 = await bleService.getCharacteristic(PID_CHUNK0_UUID);
    if (!pidChunk1) pidChunk1 = await bleService.getCharacteristic(PID_CHUNK1_UUID);
}

function resetPidState() {
    pidChunk0 = null;
    pidChunk1 = null;
    pidRequestList = new Uint8Array(40);
    pidList = [];
    renderPidList();
}

async function syncPidListFromDevice() {
    if (!bleDevice || !bleDevice.gatt?.connected || !bleService) return;
    try {
        await ensurePidCharacteristics();
        const v0 = new Uint8Array((await pidChunk0.readValue()).buffer);
        const v1 = new Uint8Array((await pidChunk1.readValue()).buffer);
        const combined = new Uint8Array(40);
        combined.set(v0.slice(0, 20), 0);
        combined.set(v1.slice(0, 20), 20);
        pidRequestList = combined;
        const entries = Array.from(combined);
        const lastNonZero = entries.reduce((acc, val, idx) => val !== 0 ? idx : acc, -1);
        pidList = lastNonZero === -1 ? [] : entries.slice(0, lastNonZero + 1);
        renderPidList();
        console.log(`PID list read (${pidList.length})`);
    } catch (err) {
        console.warn('PID list read failed', err);
        logBle(`PID list read failed: ${err.message}`);
    }
}

async function clearPidList(shouldWrite = false) {
    pidList = [];
    pidRequestList = new Uint8Array(40);
    renderPidList();
    if (shouldWrite) {
        try {
            await writePidListToDevice();
        } catch (err) {
            console.warn('PID clear failed', err);
        }
    }
}

async function writePidListToDevice() {
    if (!bleDevice || !bleDevice.gatt?.connected) {
        showNotification('Connect to BLE to write PID list.', 'warning');
        return;
    }
    try {
        await ensurePidCharacteristics();
        pidRequestList = new Uint8Array(40);
        pidList.slice(0, 40).forEach((pidVal, idx) => {
            pidRequestList[idx] = pidVal & 0xFF;
        });
        const first = pidRequestList.slice(0, 20);
        const second = pidRequestList.slice(20, 40);
        if (pidChunk0.writeValueWithoutResponse) {
            await pidChunk0.writeValueWithoutResponse(first);
        } else {
            await pidChunk0.writeValue(first);
        }
        if (pidChunk1.writeValueWithoutResponse) {
            await pidChunk1.writeValueWithoutResponse(second);
        } else {
            await pidChunk1.writeValue(second);
        }
        logBle(`PID list wrote (${pidList.length}): ${toHex(pidRequestList)}`);
        showNotification('PID list updated', 'info', 2500);
    } catch (err) {
        console.error('PID list write failed', err);
        logBle(`PID list write failed: ${err.message}`);
        showNotification('Failed to write PID list: ' + err.message, 'error', 4000);
    }
}

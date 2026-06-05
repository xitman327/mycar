let API_BASE = localStorage.getItem('esp32_host');
let API_SECRET = localStorage.getItem('esp32_secret');

async function generateKey() {
    const SECRET = API_SECRET || "CHANGE_THIS_SECRET";
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const base = SECRET + `${yyyy}${mm}${dd}${hh}`;
    // console.log(base);
    const encoder = new TextEncoder();
    const data = encoder.encode(base);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const final = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    return final;
}

async function esp32Fetch(url, options = {}) {
    API_BASE = localStorage.getItem('esp32_host');
    API_SECRET = localStorage.getItem('esp32_secret');

    if (!API_BASE || !API_SECRET) {
        showAuth();
        throw new Error('AUTH_MISSING');
    }

    const key = await generateKey();

    const headers = {
        ...(options.headers || {}),
        'X-ESP32-KEY': key
    };

    const res = await fetch(url, {
        ...options,
        headers
    });

    if (res.status === 401 || res.status === 403) {
        showAuth();
        throw new Error('AUTH_INVALID');
    }

    if (!res.ok) {
        throw new Error(`HTTP_${res.status}`);
    }

    return res;
}

function showAuth() {
    document.getElementById('basic-auth-overlay').style.display = 'flex';
}

function hideAuth() {
    document.getElementById('basic-auth-overlay').style.display = 'none';
}

async function submitAuth() {
    API_BASE = document.getElementById('auth-url').value;
    API_SECRET = document.getElementById('auth-secret').value;

    localStorage.setItem('esp32_host', API_BASE);
    localStorage.setItem('esp32_secret', API_SECRET);



    try {
        // test credentials by pinging
        await pingServer();
        hideAuth();
        await loadTrips();
    } catch (e) {
        localStorage.removeItem('esp32_host');
        localStorage.removeItem('esp32_secret');
        const el = document.getElementById('auth-error');
        el.textContent = 'Connection failed: ' + e.message;
        el.style.display = 'block';
    }
}

// ─── ESP32 API Helpers ───────────────────────────────────────────────

async function pingServer() {
    const key = await generateKey();
    const response = await fetch(`${API_BASE}/esp32/cmd?cmd=ping`, {
        method: "GET",
        headers: { "X-ESP32-KEY": key }
    });
    return await response.json();
}

async function getFiles() {
    const key = await generateKey();
    const response = await fetch(`${API_BASE}/esp32/cmd?cmd=get_files`, {
        method: "GET",
        headers: { "X-ESP32-KEY": key }
    });
    return await response.json();
}

async function getFile(file) {
    const key = await generateKey();
    const response = await fetch(`${API_BASE}/esp32/file?name=` + encodeURIComponent(file), {
        method: "GET",
        headers: { "X-ESP32-KEY": key }
    });
    return await response.text();
}

async function deleteFile(file) {
    const key = await generateKey();
    const response = await fetch(`${API_BASE}/esp32/cmd?cmd=delete_file&file=` + encodeURIComponent(file), {
        method: "GET",
        headers: { "X-ESP32-KEY": key }
    });
    return await response.json();
}

async function getDatabase() {
    const key = await generateKey();
    const response = await fetch(`${API_BASE}/esp32/database`, {
        method: "GET",
        headers: { "X-ESP32-KEY": key }
    });
    return await response.json();
}

async function scanDatabase() {
    const key = await generateKey();
    const response = await fetch(`${API_BASE}/esp32/database/scan`, {
        method: "GET",
        headers: { "X-ESP32-KEY": key }
    });
    return await response.json();
}

async function getTripsByDate(start_date, end_date) {
    const key = await generateKey();
    const response = await fetch(
        `${API_BASE}/esp32/trips/by_date?start_date=` + encodeURIComponent(start_date) + '&end_date=' + encodeURIComponent(end_date),
        {
            method: "GET",
            headers: { "X-ESP32-KEY": key }
        }
    );
    return await response.json();
}

async function getTripsSummary() {
    const key = await generateKey();
    const response = await fetch(`${API_BASE}/esp32/trips/summary`, {
        method: "GET",
        headers: { "X-ESP32-KEY": key }
    });
    return await response.json();
}

// ─── Trip File Parsing ───────────────────────────────────────────────

/**
 * Parse a trip file in the custom format:
 * First line: JSON with start_timestamp, log_objs (column headers)
 * Middle lines: CSV data matching log_objs columns
 * Last line: JSON with stop_timestamp, trip_locations_count, etc.
 */
function parseTripFile(content, filename) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return null;

    // First line is JSON header
    const header = JSON.parse(lines[0]);

    // Last line is JSON footer
    const footer = JSON.parse(lines[lines.length - 1]);

    // Middle lines are CSV data
    const csvLines = lines.slice(1, lines.length - 1);

    const headers = header.log_objs[0].map(h =>
        h.trim().replace(/ /g, "_").replace(/[^\w]/g, "")
    );

    const locations = csvLines.map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((key, i) => {
            const val = values[i];
            obj[key] = val !== undefined ? (isNaN(val) ? val : parseFloat(val)) : null;
        });
        return obj;
    });

    return {
        id: filename,
        name: filename.replace(/\.(trip|csv)$/, ''),

        start_timestamp: header.start_timestamp,
        end_timestamp: footer.stop_timestamp || null,
        trip_duration: footer.stop_timestamp ? (footer.stop_timestamp - header.start_timestamp) : null,
        trip_locations_count: footer.trip_locations_count || locations.length,
        trip_locations: locations,
        log_objs: header.log_objs,
        trip_distance: footer.trip_distance || 0,
        top_speed: footer.top_speed || 0,
        max_consumption: footer.max_consumption || 0,
        avg_consumption: footer.avg_consumption || 0
    };
}

let positionMap;
let positionMarkers = [];
let positionCoordinates = [];

const LIGHT_TILE = {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
};
const DARK_TILE = {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
};
let mapBaseLayer = null;
let positionBaseLayer = null;

function getEffectiveTheme(mode) {
    if (mode === 'night') return 'night';
    if (mode === 'day') return 'day';
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'night' : 'day';
}

function setMapTheme(themeMode) {
    const effective = getEffectiveTheme(themeMode);
    const tile = effective === 'night' ? DARK_TILE : LIGHT_TILE;

    if (map) {
        if (mapBaseLayer) map.removeLayer(mapBaseLayer);
        mapBaseLayer = L.tileLayer(tile.url, { attribution: tile.attribution });
        mapBaseLayer.addTo(map);
    }
    if (positionMap) {
        if (positionBaseLayer) positionMap.removeLayer(positionBaseLayer);
        positionBaseLayer = L.tileLayer(tile.url, { attribution: tile.attribution });
        positionBaseLayer.addTo(positionMap);
    }
}

// Initialize map
let map = L.map('map', {
    fadeAnimation: true,
    markerZoomAnimation: true,
    scrollWheelZoom: true,
    touchZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
    zoomControl: false
}).setView([0, 0], 2);
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

const carIcon = L.divIcon({
    className: 'car-icon',
    html: '🚗',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
});
let liveCarMarker = null;
let lastCarLocationTs = 0;
const LIVE_CAR_UPDATE_INTERVAL = 1000;

// Add tile layer
setMapTheme(localStorage.getItem('ui_theme') || 'system');

// Get current location
map.locate({
    setView: true,
    maxZoom: 16,
    watch: false,
    enableHighAccuracy: true
});

// Handle location found
map.on('locationfound', function (e) {
    L.marker([e.latlng.lat, e.latlng.lng]).addTo(map)
        .bindPopup("You are here").openPopup();

    L.circle(e.latlng, {
        color: 'blue',
        fillColor: '#30f',
        fillOpacity: 0.2,
        radius: e.accuracy
    }).addTo(map);
});

// Handle location error
map.on('locationerror', function (e) {
    showNotification("Location access denied.", 'warning');
});


// Initialize the position map when modal is shown
document.getElementById('addTripModal').addEventListener('shown.bs.modal', function () {
    positionMap = L.map('position-map').setView([0, 0], 2);
    setMapTheme(localStorage.getItem('ui_theme') || 'system');

    // Add click handler to map
    positionMap.on('click', function (e) {
        document.getElementById('position-lat').value = e.latlng.lat.toFixed(6);
        document.getElementById('position-lng').value = e.latlng.lng.toFixed(6);
    });
});

// Clear the position map when modal is hidden
document.getElementById('addTripModal').addEventListener('hidden.bs.modal', function () {
    if (positionMap) {
        positionMap.remove();
        positionMap = null;
    }
    positionCoordinates = [];
    positionMarkers = [];
    document.getElementById('positions-container').innerHTML = '';
});

// Add position button handler
document.getElementById('add-position-btn').addEventListener('click', function () {
    const lat = parseFloat(document.getElementById('position-lat').value);
    const lng = parseFloat(document.getElementById('position-lng').value);

    if (isNaN(lat) || isNaN(lng)) {
        alert('Please enter valid coordinates');
        return;
    }

    // Add to coordinates array
    const position = {
        lat: lat,
        lng: lng,
        time: Math.floor(Date.now() / 1000),
        time_string: new Date().toLocaleString(),
        speed: 0,
        consumption: { lps: 0 }
    };
    positionCoordinates.push(position);

    // Add marker to map
    const marker = L.marker([lat, lng]).addTo(positionMap)
        .bindPopup(`Position ${positionCoordinates.length}`);
    positionMarkers.push(marker);

    // Add to positions list
    const positionElement = document.createElement('div');
    positionElement.className = 'd-flex justify-content-between align-items-center p-2 border-bottom';
    positionElement.innerHTML = `
        <div>
            <strong>Position ${positionCoordinates.length}</strong>
            <div class="text-muted small">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
        </div>
        <button class="btn btn-sm btn-outline-danger remove-position" data-index="${positionCoordinates.length - 1}">
            &times;
        </button>
    `;
    document.getElementById('positions-container').appendChild(positionElement);

    // Add remove handler
    positionElement.querySelector('.remove-position').addEventListener('click', function () {
        const index = parseInt(this.getAttribute('data-index'));
        positionCoordinates.splice(index, 1);
        positionMap.removeLayer(positionMarkers[index]);
        positionMarkers.splice(index, 1);
        renderPositionList();
    });

    // Clear inputs
    document.getElementById('position-lat').value = '';
    document.getElementById('position-lng').value = '';

    // Zoom to show all markers
    if (positionMarkers.length > 0) {
        const group = new L.featureGroup(positionMarkers);
        positionMap.fitBounds(group.getBounds());
    }
});

function renderPositionList() {
    const container = document.getElementById('positions-container');
    container.innerHTML = '';

    positionCoordinates.forEach((pos, index) => {
        const positionElement = document.createElement('div');
        positionElement.className = 'd-flex justify-content-between align-items-center p-2 border-bottom';
        positionElement.innerHTML = `
            <div>
                <strong>Position ${index + 1}</strong>
                <div class="text-muted small">${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}</div>
            </div>
            <button class="btn btn-sm btn-outline-danger remove-position" data-index="${index}">
                &times;
            </button>
        `;
        container.appendChild(positionElement);

        // Add remove handler
        positionElement.querySelector('.remove-position').addEventListener('click', function () {
            const idx = parseInt(this.getAttribute('data-index'));
            positionCoordinates.splice(idx, 1);
            positionMap.removeLayer(positionMarkers[idx]);
            positionMarkers.splice(idx, 1);
            renderPositionList();
        });
    });
}

async function saveTrip() {
    const tripName = document.getElementById('trip-name').value;

    const startTimestamp = new Date(document.getElementById('start-timestamp').value).getTime() / 1000;
    const endTimestamp = new Date(document.getElementById('end-timestamp').value).getTime() / 1000;
    const distance = parseFloat(document.getElementById('trip-distance').value);
    const topSpeed = parseInt(document.getElementById('top-speed-input').value);

    if (!tripName || !startTimestamp || !endTimestamp || isNaN(distance) || isNaN(topSpeed)) {
        alert("Please fill all required fields with valid values");
        return;
    }

    const saveSpinner = document.getElementById('save-spinner');
    saveSpinner.style.display = 'inline-block';

    // Build trip file content in the custom format
    const header = {
        start_timestamp: startTimestamp,
        log_objs: [["time", "lng", "lat", "Engine RPM", "Vehicle Speed", "MAF rate", "Throttle pos", "Coolant Temp", "Adapter Volt"]]
    };

    // Build CSV lines from position coordinates
    const csvLines = positionCoordinates.map(pos => {
        return `${pos.time},${pos.lng},${pos.lat},0,0,0,0,0,0`;
    });

    const footer = {
        start_timestamp: startTimestamp,
        log_objs: [["time", "lng", "lat", "Engine RPM", "Vehicle Speed", "MAF rate", "Throttle pos", "Coolant Temp", "Adapter Volt"]],
        trip_locations_count: positionCoordinates.length,
        stop_timestamp: endTimestamp,
        trip_distance: distance,
        top_speed: topSpeed
    };

    const fileContent = JSON.stringify(header) + '\n' +
        csvLines.join('\n') + '\n' +
        JSON.stringify(footer);

    // Generate filename from start timestamp
    const filename = formatEpochFilenameLocal(startTimestamp) + '.trip';

    try {
        // Upload the file
        const key = await generateKey();
        const response = await fetch(`${API_BASE}/esp32/upload?name=` + encodeURIComponent(filename), {
            method: 'POST',
            headers: {
                'X-ESP32-KEY': key,
                'Content-Type': 'text/plain'
            },
            body: fileContent
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            throw new Error(errText);
        }

        document.getElementById('trip-form').reset();
        positionCoordinates = [];
        positionMarkers = [];
        document.getElementById('positions-container').innerHTML = '';
        addTripModal.hide();

        // Trigger a database scan to pick up the new file
        await scanDatabase();
        await loadTrips();
    } catch (e) {
        console.error("Error saving trip:", e);
        alert("Error saving trip: " + e.message);
    } finally {
        saveSpinner.style.display = 'none';
    }
}

// filename format: YYYY-MM-DD_HH-MM-SS (local time)
function formatEpochFilenameLocal(tsSec) {
    const d = new Date(tsSec * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}


// Global variables
let trips = [];
let selectedTrip = null;
let markers = [];
let polyline = null;
let addTripModal = null;
let sidebarOpen = true;
let diagnosticOpen = false;
let configOpen = false;
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
const METRICS1_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';
const METRICS2_UUID = '19b10002-e8f2-537e-4f6c-d104768a1214';
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

document.getElementById('dashboard-content').style.display = 'flex';
document.getElementById('user-info').style.display = 'none';

// Check if we have stored credentials, if not show auth
if (!localStorage.getItem('esp32_host') || !localStorage.getItem('esp32_secret')) {
    showAuth();
} else {
    // Load trips immediately
    loadTrips();
}

// Initialize modal
document.addEventListener('DOMContentLoaded', function () {
    addTripModal = new bootstrap.Modal(document.getElementById('addTripModal'));

    // Set default timestamps
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 16);
    document.getElementById('start-timestamp').value = formattedDate;
    document.getElementById('end-timestamp').value = formattedDate;

    // Sidebar toggle
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    document.body.classList.toggle('sidebar-open', sidebarOpen);
    toggleBtn.addEventListener('click', () => {
        sidebarOpen = !sidebarOpen;
        sidebar.classList.toggle('hidden', !sidebarOpen);
        document.body.classList.toggle('sidebar-open', sidebarOpen);
        setTimeout(() => map.invalidateSize(), 120);
    });

    // Diagnostics toggle
    const diagnosticPanel = document.getElementById('diagnostic-panel');
    const diagnosticToggle = document.getElementById('diagnostic-toggle');
    diagnosticPanel.classList.add('hidden');
    document.body.classList.toggle('diagnostic-open', diagnosticOpen);
    diagnosticToggle.addEventListener('click', () => {
        diagnosticOpen = !diagnosticOpen;
        if (diagnosticOpen && configOpen) {
            configOpen = false;
            document.getElementById('config-panel').classList.add('hidden');
            document.body.classList.remove('config-open');
        }
        diagnosticPanel.classList.toggle('hidden', !diagnosticOpen);
        document.body.classList.toggle('diagnostic-open', diagnosticOpen);
        if (diagnosticOpen && window.innerWidth <= 992) hideSidebar();
        setTimeout(() => map.invalidateSize(), 120);
    });

    const configPanel = document.getElementById('config-panel');
    const configToggle = document.getElementById('config-toggle');
    configPanel.classList.add('hidden');
    document.body.classList.toggle('config-open', configOpen);
    configToggle.addEventListener('click', () => {
        configOpen = !configOpen;
        if (configOpen && diagnosticOpen) {
            diagnosticOpen = false;
            diagnosticPanel.classList.add('hidden');
            document.body.classList.remove('diagnostic-open');
        }
        configPanel.classList.toggle('hidden', !configOpen);
        document.body.classList.toggle('config-open', configOpen);
        if (configOpen && window.innerWidth <= 992) hideSidebar();
        setTimeout(() => map.invalidateSize(), 120);
    });

    const btnConnect = document.getElementById('ble-connect-btn');
    const btnDisconnect = document.getElementById('ble-disconnect-btn');
    const btnConnectConfig = document.getElementById('ble-connect-btn-config');
    const btnDisconnectConfig = document.getElementById('ble-disconnect-btn-config');
    if (btnConnect) btnConnect.addEventListener('click', connectBle);
    if (btnDisconnect) btnDisconnect.addEventListener('click', disconnectBle);
    if (btnConnectConfig) btnConnectConfig.addEventListener('click', connectBle);
    if (btnDisconnectConfig) btnDisconnectConfig.addEventListener('click', disconnectBle);

    hydratePidSelect();
    renderPidList();
    const pidAddBtn = document.getElementById('pid-add-btn');
    if (pidAddBtn) pidAddBtn.addEventListener('click', handlePidAdd);
    const pidRefreshBtn = document.getElementById('pid-refresh-btn');
    if (pidRefreshBtn) pidRefreshBtn.addEventListener('click', () => syncPidListFromDevice().catch(console.error));
    const pidClearBtn = document.getElementById('pid-clear-btn');
    if (pidClearBtn) pidClearBtn.addEventListener('click', () => clearPidList(true));

    hydrateTripStartSelect();
    initThemeSelect();
    const settingsReadBtn = document.getElementById('settings-read-btn');
    const settingsSaveBtn = document.getElementById('settings-save-btn');
    if (settingsReadBtn) settingsReadBtn.addEventListener('click', () => readSettingsFromDevice().catch(console.error));
    if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', () => writeSettingsToDevice().catch(console.error));
    const wifiConfigBtn = document.getElementById('wifi-config-btn');
    if (wifiConfigBtn) wifiConfigBtn.addEventListener('click', showWifiConfig);
    const noderedConfigBtn = document.getElementById('nodered-config-btn');
    if (noderedConfigBtn) noderedConfigBtn.addEventListener('click', showNodeRedConfig);
});

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

function hydratePidSelect() {
    const select = document.getElementById('pid-select');
    if (!select) return;
    select.innerHTML = PID_OPTIONS.map(opt => {
        const hex = opt.value.toString(16).padStart(2, '0').toUpperCase();
        return `<option value="${hex}">${opt.label}</option>`;
    }).join('');
}

function hydrateTripStartSelect() {
    const select = document.getElementById('trip-start-condition');
    if (!select) return;
    select.innerHTML = TRIP_START_CONDITIONS.map(opt => {
        return `<option value="${opt.value}">${opt.label}</option>`;
    }).join('');
}

function parseBoolInput(value) {
    if (value === undefined || value === null) return false;
    const s = String(value).trim().toLowerCase();
    if (!s) return false;
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
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
        // console.log(data1);
        // console.log(data2);

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

// Add Trip Button
document.getElementById('refresh-trip-btn').addEventListener('click', () => {
    loadTrips();
});
document.getElementById('add-trip-btn').addEventListener('click', () => {
    addTripModal.show();
});

// Save Trip Button
document.getElementById('save-trip').addEventListener('click', saveTrip);

async function loadTrips() {
    try {
        const db = await getDatabase();
        console.log(db);
        // db is expected to be an object with file entries, or an array
        let tripEntries = [];
        if (Array.isArray(db)) {
            tripEntries = db;
        } else if (db && typeof db === 'object') {
            // Try to extract trips from the database object
            // The database returns { files: { ... }, last_scan: "...", ... }
            if (db.files && typeof db.files === 'object') {
                tripEntries = Object.values(db.files).filter(v => v && typeof v === 'object');
            } else {
                tripEntries = Object.values(db).filter(v => v && typeof v === 'object');
            }
        }

        // Parse each trip file from the database
        trips = [];
        for (const entry of tripEntries) {
            const filename = entry.filename || entry.name || entry.id || '';
            // Support both .trip and .csv file extensions
            if (!filename.endsWith('.trip') && !filename.endsWith('.csv')) continue;

            try {
                const content = await getFile(filename);
                const parsed = parseTripFile(content, filename);
                if (parsed) {
                    trips.push(parsed);
                }
            } catch (e) {
                console.warn(`Failed to load trip file ${filename}:`, e);
            }
        }

        // Sort by start_timestamp descending (newest first)
        trips.sort((a, b) => (b.start_timestamp || 0) - (a.start_timestamp || 0));

        renderTrips();
        updateStats();
    } catch (e) {
        console.error("Error loading trips:", e);
        document.getElementById('trips-list').innerHTML = `
                <div class="alert alert-danger">
                    Error loading trips: ${e.message}
                    <button class="btn btn-primary w-100" onclick="showAuth()">Login Again</button>
                </div>
                `;
    }
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

// Render trips list
function renderTrips() {
    const tripsList = document.getElementById('trips-list');
    const tripCount = document.getElementById('trip-count');

    if (trips.length === 0) {
        tripsList.innerHTML = '<p>No trips found. Add your first trip!</p>';
        tripCount.textContent = '0 trips total';
        return;
    }

    tripCount.textContent = `${trips.length} trips total`;

    tripsList.innerHTML = trips.map(trip => {
        const distance = trip.trip_distance || 0;
        const durationSec = trip.trip_duration || 0;
        const avgSpeed = durationSec > 0 ? `${(distance / (durationSec / 3600)).toFixed(1)} km/h` : 'N/A';
        const avgConsumptionRaw = trip.avg_consumption ?? null;
        const avgConsumption = avgConsumptionRaw !== null && avgConsumptionRaw !== undefined
            ? `${Number(avgConsumptionRaw).toFixed(1)} L/km`
            : 'N/A';
        const maxConsumption = formatFixed(trip.max_consumption, 1, '0.0');

        return `
                <div class="card trip-card mb-2 ${selectedTrip?.id === trip.id ? 'active-trip' : ''}" data-id="${trip.id}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start gap-2">
                            <div class="flex-grow-1">
                                <div class="d-flex justify-content-between align-items-start">
                                    <h6 class="card-title mb-0">${formatTimestamp(trip.start_timestamp)}</h6>
                                </div>
                                <div class="trip-time">
                                    ${trip.name || formatTripId(trip.id)}
                                </div>
                                <div class="trip-stats d-flex flex-wrap text-muted mt-1">
                                    <span>Dur ${formatDuration(durationSec)}</span>
                                    <span>Dist ${trip.trip_distance ? trip.trip_distance.toFixed(2) + ' km' : 'N/A'}</span>
                                    <span>Top ${trip.top_speed || 0} km/h</span>
                                    <span>Avg ${avgSpeed}</span>
                                    <span>Max Cons ${maxConsumption}</span>
                                    <span>Avg Cons ${avgConsumption}</span>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-outline-danger delete-trip" data-id="${trip.id}">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
                `;
    }).join('');

    // Add click event listeners
    document.querySelectorAll('.trip-card').forEach(card => {
        card.addEventListener('click', function () {
            const tripId = this.getAttribute('data-id');
            selectTrip(tripId);
        });
    });

    // Add delete handlers
    document.querySelectorAll('.delete-trip').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const tripId = this.getAttribute('data-id');
            deleteTrip(tripId);
        });
    });
}

async function deleteTrip(tripId) {
    if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) return;

    const deleteBtn = document.querySelector(`.delete-trip[data-id="${tripId}"]`);
    const originalText = deleteBtn ? deleteBtn.innerHTML : '';
    if (deleteBtn) {
        deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Deleting...';
        deleteBtn.disabled = true;
    }

    try {
        await deleteFile(tripId);

        if (selectedTrip && selectedTrip.id === tripId) {
            selectedTrip = null;
            document.getElementById('trip-details').style.display = 'none';
            clearMap();
            map.setView([0, 0], 2);
        }

        await loadTrips();
    } catch (e) {
        console.error(e);
        alert('Failed to delete trip: ' + e.message);
    } finally {
        if (deleteBtn) {
            deleteBtn.innerHTML = originalText;
            deleteBtn.disabled = false;
        }
    }
}

function formatTripId(id) {
    return id.replace(/_/g, ' ').replace(/__/g, ':');
}

async function selectTrip(tripId) {
    try {
        const content = await getFile(tripId);
        selectedTrip = parseTripFile(content, tripId);
        if (!selectedTrip) throw new Error('Failed to parse trip file');
    } catch (e) {
        console.error(e);
        alert("Failed to load trip: " + e.message);
        return;
    }

    document.querySelectorAll('.trip-card').forEach(card => {
        card.classList.toggle('active-trip', card.getAttribute('data-id') === tripId);
    });

    document.getElementById('trip-details').style.display = 'block';
    document.getElementById('top-speed').textContent = `${selectedTrip.top_speed || 0} km/h`;
    const tripDurationSeconds = selectedTrip.trip_duration || null;
    document.getElementById('trip-duration').textContent = formatDurationCompact(tripDurationSeconds);
    const maxConsumption = formatFixed(selectedTrip.max_consumption, 1, '0.0');
    document.getElementById('max-consumption').textContent = `${maxConsumption} L/km`;
    document.getElementById('start-time').textContent = formatTimestamp(selectedTrip.start_timestamp);
    document.getElementById('end-time').textContent = formatTimestamp(selectedTrip.end_timestamp);

    const locations = selectedTrip.trip_locations || [];
    const distance = selectedTrip.trip_distance || 0;
    document.getElementById('locations-count').textContent = distance > 0 ? `${distance.toFixed(2)} km` : `${locations.length} pts`;

    clearMap();

    if (locations.length > 0) {
        const latlngs = locations
            .filter(loc => loc.lat !== -1 && loc.lng !== -1 && loc.lat !== undefined && loc.lng !== undefined)
            .map(loc => [loc.lat, loc.lng]);

        if (latlngs.length > 0) {
            polyline = L.polyline(latlngs, {
                color: '#0d6efd',
                weight: 3,
                opacity: 0.8
            }).addTo(map);

            map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

            // Add start marker
            const startLoc = latlngs[0];
            const startIcon = L.divIcon({
                className: 'start-icon',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });
            L.marker(startLoc, { icon: startIcon }).addTo(map)
                .bindPopup('Start: ' + formatTimestamp(selectedTrip.start_timestamp));

            // Add end marker
            const endLoc = latlngs[latlngs.length - 1];
            const endIcon = L.divIcon({
                className: 'end-icon',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });
            L.marker(endLoc, { icon: endIcon }).addTo(map)
                .bindPopup('End: ' + formatTimestamp(selectedTrip.end_timestamp));

            // Add direction markers along the route
            const step = Math.max(1, Math.floor(latlngs.length / 20));
            for (let i = step; i < latlngs.length - 1; i += step) {
                const loc = latlngs[i];
                const prevLoc = latlngs[i - 1];
                const angle = Math.atan2(loc[0] - prevLoc[0], loc[1] - prevLoc[1]) * (180 / Math.PI);

                const triangleIcon = L.divIcon({
                    className: 'triangle-marker',
                    html: `<svg class="triangle-shape" style="--rotation: ${angle}deg" viewBox="0 0 20 20" width="20" height="20">
                            <polygon points="10,0 20,20 0,20" fill="#0d6efd" opacity="0.6"/>
                        </svg>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 20]
                });
                L.marker(loc, { icon: triangleIcon }).addTo(map);
            }
        }
    }
}

function clearMap() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    if (polyline) {
        map.removeLayer(polyline);
        polyline = null;
    }
}

function clearLiveCarMarker() {
    if (liveCarMarker) {
        map.removeLayer(liveCarMarker);
        liveCarMarker = null;
    }
}

function updateLiveCarMarkerIfNeeded() {
    const gpsPos = diagnosticData.gpsPos;
    if (!gpsPos || !gpsPos.lat || !gpsPos.lng) return;

    const now = Date.now();
    if (now - lastCarLocationTs < LIVE_CAR_UPDATE_INTERVAL) return;
    lastCarLocationTs = now;

    if (!liveCarMarker) {
        liveCarMarker = L.marker([gpsPos.lat, gpsPos.lng], { icon: carIcon }).addTo(map);
    } else {
        liveCarMarker.setLatLng([gpsPos.lat, gpsPos.lng]);
    }
}

function parseGpsPosition(pos) {
    if (!pos) return null;
    if (typeof pos === 'object' && pos.lat !== undefined && pos.lng !== undefined) {
        return pos;
    }
    if (typeof pos === 'string') {
        const parts = pos.split(',').map(s => parseFloat(s.trim()));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return { lat: parts[0], lng: parts[1] };
        }
    }
    return null;
}

function toHex(uint8Array) {
    return Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

function formatTimestamp(ts) {
    if (!ts) return 'N/A';
    const d = new Date(ts * 1000);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString();
}

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatDurationCompact(seconds) {
    if (!seconds || seconds <= 0) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatFixed(value, decimals, fallback) {
    if (value === null || value === undefined || isNaN(value)) return fallback || 'N/A';
    return Number(value).toFixed(decimals);
}

function updateStats() {
    const totalTrips = trips.length;
    let totalDistance = 0;
    let totalDuration = 0;
    let totalTopSpeed = 0;

    trips.forEach(trip => {
        totalDistance += trip.trip_distance || 0;
        totalDuration += trip.trip_duration || 0;
        if (trip.top_speed > totalTopSpeed) totalTopSpeed = trip.top_speed;
    });

    document.getElementById('total-trips').textContent = totalTrips;
    document.getElementById('total-distance').textContent = `${totalDistance.toFixed(2)} km`;
    document.getElementById('total-time').textContent = formatDuration(totalDuration);

    const avgSpeed = totalDuration > 0 ? (totalDistance / (totalDuration / 3600)) : 0;
    document.getElementById('avg-speed').textContent = `${avgSpeed.toFixed(1)} km/h`;
}

function showNotification(message, type = 'info', duration = 3000) {
    const banner = document.getElementById('notification-banner');
    if (!banner) return;

    banner.textContent = message;
    banner.className = 'notification-banner show ' + (type || 'info');
    banner.style.display = 'block';

    setTimeout(() => {
        banner.classList.remove('show');
        setTimeout(() => {
            banner.style.display = 'none';
        }, 200);
    }, duration);
}

function hideSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebarOpen = false;
    sidebar.classList.add('hidden');
    document.body.classList.remove('sidebar-open');
    setTimeout(() => map.invalidateSize(), 120);
}



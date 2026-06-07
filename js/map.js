// ─── Map Management ──────────────────────────────────────────────────

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

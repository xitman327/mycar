// ─── Trip UI (Listing, Selection, Deletion, Stats) ───────────────────

let trips = [];
let selectedTrip = null;
let markers = [];
let polyline = null;

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
            const startMarker = L.marker(startLoc, { icon: startIcon }).addTo(map)
                .bindPopup('Start: ' + formatTimestamp(selectedTrip.start_timestamp));
            markers.push(startMarker);

            // Add end marker
            const endLoc = latlngs[latlngs.length - 1];
            const endIcon = L.divIcon({
                className: 'end-icon',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });
            const endMarker = L.marker(endLoc, { icon: endIcon }).addTo(map)
                .bindPopup('End: ' + formatTimestamp(selectedTrip.end_timestamp));
            markers.push(endMarker);

            // Build a label map from the original log_objs headers
            // The parser sanitizes headers by replacing spaces with _ and removing non-word chars
            const originalHeaders = (selectedTrip.log_objs) || [];
            const labelMap = {};
            for (const h of originalHeaders) {
                const sanitized = h.trim().replace(/ /g, "_").replace(/[^\w]/g, "");
                labelMap[sanitized] = h.trim();
            }

            // Add markers with popups along the route
            const step = Math.max(1, Math.floor(latlngs.length / 20));
            for (let i = step; i < latlngs.length - 1; i += step) {
                const loc = latlngs[i];
                const dataPoint = locations[i];
                
                // Determine marker color based on speed (green=0, red=150)
                let markerColor = '#0d6efd'; // default blue
                if (dataPoint) {
                    const speed = dataPoint.Vehicle_Speed !== undefined ? dataPoint.Vehicle_Speed : dataPoint.speed;
                    if (speed !== undefined && speed !== null && !isNaN(speed)) {
                        const clampedSpeed = Math.min(150, Math.max(0, speed));
                        const ratio = clampedSpeed / 150; // 0 = green, 1 = red
                        markerColor = getSpeedColor(ratio);
                    }
                }
                
                const dotIcon = L.divIcon({
                    className: 'route-dot-marker',
                    html: `<div style="width:10px;height:10px;border-radius:50%;background:${markerColor};opacity:0.8;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                });
                const dotMarker = L.marker(loc, { icon: dotIcon }).addTo(map);
                
                // Build popup content from the data point
                if (dataPoint) {
                    const popupContent = buildPointPopup(dataPoint, i, labelMap);
                    dotMarker.bindPopup(popupContent, {
                        maxWidth: 280,
                        className: 'trip-point-popup'
                    });
                }
                
                markers.push(dotMarker);
            }

        }
    }
}

/**
 * Build a popup HTML string for a single trip data point.
 * Uses the original column headers from the file as labels.
 * @param {Object} dataPoint - The parsed data point object
 * @param {number} index - The point index in the trip
 * @param {Object} labelMap - Mapping from sanitized keys to original header labels
 */
function buildPointPopup(dataPoint, index, labelMap) {
    const excludedKeys = new Set(['lat', 'lng']);
    const rows = [];

    for (const [key, val] of Object.entries(dataPoint)) {
        if (excludedKeys.has(key)) continue;
        if (val === undefined || val === null || val === '') continue;

        // Use the original header label from the file if available
        const label = (labelMap && labelMap[key]) || key;

        let displayVal = val;
        // Format timestamp fields nicely
        if (key === 'time' && typeof val === 'number') {
            displayVal = formatTimestamp(val);
        }
        // Add units where known based on the original label
        const labelLower = (labelMap && labelMap[key] || key).toLowerCase();
        if (labelLower.includes('speed')) displayVal = `${val} km/h`;
        else if (labelLower.includes('rpm')) displayVal = `${val}`;
        else if (labelLower.includes('temp')) displayVal = `${val} °C`;
        else if (labelLower.includes('volt')) displayVal = `${val} V`;
        else if (labelLower.includes('throttle')) displayVal = `${val}%`;
        else if (labelLower.includes('maf') || labelLower.includes('rate')) displayVal = `${val} g/s`;

        rows.push(`<div class="popup-row"><span class="popup-label">${label}</span><span class="popup-value">${displayVal}</span></div>`);
    }

    // Point index at the bottom
    rows.push(`<div class="popup-row popup-row-muted"><span class="popup-label">Point</span><span class="popup-value">#${index}</span></div>`);

    return `<div class="trip-point-popup-inner">${rows.join('')}</div>`;
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

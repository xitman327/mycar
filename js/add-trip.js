// ─── Add Trip Modal ──────────────────────────────────────────────────

let addTripModal = null;

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

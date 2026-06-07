// ─── Main Entry Point ────────────────────────────────────────────────

let sidebarOpen = true;
let diagnosticOpen = false;
let configOpen = false;

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

    setTimeout(() => map.invalidateSize(), 120);

    
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

// Add Trip Button
document.getElementById('refresh-trip-btn').addEventListener('click', () => {
    loadTrips();
});
document.getElementById('add-trip-btn').addEventListener('click', () => {
    addTripModal.show();
});

// Save Trip Button
document.getElementById('save-trip').addEventListener('click', saveTrip);

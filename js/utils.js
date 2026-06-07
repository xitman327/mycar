// ─── Utility Functions ───────────────────────────────────────────────

function pad(num) {
    return num.toString().padStart(2, '0');
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

function formatTripId(id) {
    return id.replace(/_/g, ' ').replace(/__/g, ':');
}

function toHex(uint8Array) {
    return Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

function parseBoolInput(value) {
    if (value === undefined || value === null) return false;
    const s = String(value).trim().toLowerCase();
    if (!s) return false;
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
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

// filename format: YYYY-MM-DD_HH-MM-SS (local time)
function formatEpochFilenameLocal(tsSec) {
    const d = new Date(tsSec * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Convert a speed ratio (0 to 1) to a color from green to red.
 * @param {number} ratio - Value between 0 and 1 (0 = green, 1 = red)
 * @returns {string} CSS color string
 */
function getSpeedColor(ratio) {
    // Interpolate from green (0, 255, 0) to red (255, 0, 0)
    const r = Math.min(255, Math.round(ratio * 255));
    const g = Math.min(255, Math.round((1 - ratio) * 255));
    return `rgb(${r}, ${g}, 0)`;
}




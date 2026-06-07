// ─── Authentication ──────────────────────────────────────────────────

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

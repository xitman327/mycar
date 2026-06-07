// ─── ESP32 API Helpers ───────────────────────────────────────────────

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

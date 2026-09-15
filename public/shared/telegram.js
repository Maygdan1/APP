export const tg = window.Telegram.WebApp;
export const API_URL = window.location.origin;

tg.ready();
tg.expand();

export function showAlert(message) {
    try {
        Promise.resolve(tg.showAlert(message)).catch(() => console.warn(message));
    } catch {
        console.warn(message);
    }
}

let sessionToken = sessionStorage.getItem('session_token');

async function ensureSession() {
    if (sessionToken) return sessionToken;
    const response = await fetch(`${API_URL}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData })
    });
    if (!response.ok) throw new Error('Не удалось подтвердить Telegram-сессию');
    const data = await response.json();
    sessionToken = data.token;
    sessionStorage.setItem('session_token', sessionToken);
    return sessionToken;
}

export async function apiFetch(url, options = {}) {
    await ensureSession();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${sessionToken}` };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        sessionStorage.removeItem('session_token');
        sessionToken = null;
    }
    return response;
}
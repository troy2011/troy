// c:/Users/ikeda/my-liff-app/public/js/api.js

const API_AUTH_EXCLUDE_PATHS = new Set([
    '/api/login-playfab'
]);

function shouldAttachApiAuth(url) {
    try {
        const resolved = new URL(String(url || ''), window.location.origin);
        if (resolved.origin !== window.location.origin) return false;
        if (!resolved.pathname.startsWith('/api/')) return false;
        return !API_AUTH_EXCLUDE_PATHS.has(resolved.pathname);
    } catch {
        return false;
    }
}

async function getFirebaseAuthToken() {
    const auth = window.__firebaseAuth || null;
    const user = auth?.currentUser || null;
    if (!user || typeof user.getIdToken !== 'function') return '';
    try {
        return String(await user.getIdToken()) || '';
    } catch (error) {
        console.warn('[api] Failed to get Firebase ID token:', error);
        return '';
    }
}

function installApiAuthFetch() {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    if (window.__apiAuthFetchInstalled) return;
    window.__apiAuthFetchInstalled = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const request = new Request(input, init);
        if (!shouldAttachApiAuth(request.url)) {
            return nativeFetch(request);
        }
        const token = await getFirebaseAuthToken();
        if (!token) {
            return nativeFetch(request);
        }
        const headers = new Headers(request.headers);
        if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        return nativeFetch(new Request(request, { headers }));
    };
}

installApiAuthFetch();

/**
 * API呼び出しとPlayFab Client SDK呼び出しをラップし、ローディングスピナーを制御する。
 * @param {string|Function} apiFunctionOrEndpoint - APIエンドポイントの文字列またはPlayFab SDKの関数
 * @param {object} body - APIに送信するリクエストボディ
 * @param {object} options - オプション { isSilent: boolean }
 * @returns {Promise<object|null>} APIからのレスポンスデータ、またはエラー時にnull
 */
export async function callApiWithLoader(apiFunctionOrEndpoint, body, options = {}) {
    options = options || {};
    const spinner = document.getElementById('loadingSpinner');
    if (spinner && !options.isSilent) spinner.style.display = 'flex';

    try {
        let data;
        if (typeof apiFunctionOrEndpoint === 'function') {
            // PlayFab Client SDK 関数を呼び出す
            data = await promisifyPlayFab(apiFunctionOrEndpoint, body);
        } else {
            // サーバーAPIエンドポイントを呼び出す
            data = await callPointApi(apiFunctionOrEndpoint, body);
        }
        if (spinner) spinner.style.display = 'none';
        return data;

    } catch (error) {
        const endpointName = (typeof apiFunctionOrEndpoint === 'string') ? apiFunctionOrEndpoint : 'PlayFabFunction';
        console.error(`Error in callApiWithLoader for ${endpointName}:`, error);
        if (spinner) spinner.style.display = 'none';

        if (options.throwOnError) {
            throw error;
        }

        if (options.isSilent) {
            return null;
        }

        // エラーメッセージの表示先を、タブごとに変える
        const errorMessage = error.message || '不明なエラー';
        if (typeof endpointName === 'string' && endpointName.includes('battle')) {
            const el = document.getElementById('battleResult');
            el.innerText = `エラー: ${errorMessage}`;
            el.style.color = 'red';
        } else {
            const _msgEl = document.getElementById('pointMessage');
            if (_msgEl) _msgEl.innerText = `通信エラー: ${errorMessage}`;
        }

        return null;
    }
}

export function buildApiUrl(endpoint) {
    if (!endpoint) return window.API_BASE_URL || '';
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    const base = window.API_BASE_URL || '';
    if (!base) return endpoint;
    return base.replace(/\/$/, '') + endpoint;
}

window.buildApiUrl = buildApiUrl;

export function createRequestId(prefix = 'req') {
    const base = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${base}`;
}

// サーバーAPIを呼び出す内部関数
async function callPointApi(endpoint, body) {
    // エラーメッセージをクリア
    const _pointMsg = document.getElementById('pointMessage');
    if (_pointMsg) _pointMsg.innerText = '';
    const _battleMsg = document.getElementById('battleResult');
    if (_battleMsg) _battleMsg.innerText = '';

    const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }

    if (!response.ok) {
        const base = (data && data.error) ? data.error : (response.statusText || 'APIエラー');
        const details = (data && data.details) ? ': ' + data.details : '';
        throw new Error(base + details + ' (HTTP ' + response.status + ')');
    }

    return data;
}

// PlayFab Client APIをPromiseでラップする
export function promisifyPlayFab(apiFunction, request) {
    return new Promise((resolve, reject) => {
        apiFunction(request, (result, error) => {
            if (error) return reject(new Error(error.errorMessage));
            if (result && result.data) return resolve(result.data);
            resolve(result);
        });
    });
}

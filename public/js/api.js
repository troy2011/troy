// c:/Users/ikeda/my-liff-app/public/js/api.js

/**
 * API呼び出しとPlayFab Client SDK呼び出しをラップし、ローディングスピナーを制御する。
 * @param {string|Function} apiFunctionOrEndpoint - APIエンドポイントの文字列またはPlayFab SDKの関数
 * @param {object} body - APIに送信するリクエストボディ
 * @param {object} options - オプション { isSilent: boolean }
 * @returns {Promise<object|null>} APIからのレスポンスデータ、またはエラー時にnull
 */
export async function callApiWithLoader(apiFunctionOrEndpoint, body, options = {}) {
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
            document.getElementById('pointMessage').innerText = `通信エラー: ${errorMessage}`;
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

// サーバーAPIを呼び出す内部関数
async function callPointApi(endpoint, body) {
    // エラーメッセージをクリア
    document.getElementById('pointMessage').innerText = '';
    document.getElementById('battleResult').innerText = '';

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

const https = require('https');

function normalizePlayFabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^playfab:/i, '').trim().toUpperCase();
}

function readAuthorizationBearerToken(req) {
    const headerValue = String(
        req?.headers?.authorization
        || req?.headers?.Authorization
        || req?.get?.('authorization')
        || ''
    ).trim();
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    return match ? String(match[1] || '').trim() : '';
}

function requestJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const request = https.request(target, {
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let data = null;
                try {
                    data = text ? JSON.parse(text) : null;
                } catch (error) {
                    return reject(new Error(`Invalid JSON response from ${target.origin}${target.pathname}`));
                }
                if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
                    return resolve(data);
                }
                const message = data?.message || data?.error || response.statusMessage || 'HTTP error';
                const statusText = response.statusCode ? ` (HTTP ${response.statusCode})` : '';
                return reject(new Error(`${message}${statusText}`));
            });
        });
        request.on('error', reject);
        request.end(options.body || undefined);
    });
}

async function verifyLineAccessToken(lineAccessToken) {
    const accessToken = String(lineAccessToken || '').trim();
    if (!accessToken) {
        throw new Error('LineAccessTokenRequired');
    }
    const profile = await requestJson('https://api.line.me/v2/profile', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    const userId = String(profile?.userId || '').trim();
    if (!userId) {
        throw new Error('LineProfileUserIdMissing');
    }
    return {
        userId,
        displayName: String(profile?.displayName || '').trim(),
        pictureUrl: String(profile?.pictureUrl || '').trim()
    };
}

async function verifyLineFriendshipStatus(lineAccessToken) {
    const accessToken = String(lineAccessToken || '').trim();
    if (!accessToken) {
        throw new Error('LineAccessTokenRequired');
    }
    const status = await requestJson('https://api.line.me/friendship/v1/status', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    return {
        friendFlag: status?.friendFlag === true
    };
}

function buildAuthHelpers({ admin }) {
    async function verifyFirebaseIdToken(req) {
        const idToken = readAuthorizationBearerToken(req);
        if (!idToken) {
            throw new Error('MissingAuthToken');
        }
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const playFabId = normalizePlayFabId(decodedToken?.uid);
        if (!playFabId) {
            throw new Error('InvalidAuthUid');
        }
        return {
            idToken,
            decodedToken,
            playFabId
        };
    }

    async function requireAuthenticatedPlayFabId(req, res, expectedPlayFabId) {
        let authInfo;
        try {
            authInfo = await verifyFirebaseIdToken(req);
        } catch (error) {
            const message = error?.message || String(error);
            res.status(401).json({ error: 'Authentication required', details: message });
            return null;
        }

        const expectedId = normalizePlayFabId(expectedPlayFabId);
        if (expectedId && authInfo.playFabId !== expectedId) {
            res.status(403).json({
                error: 'Authenticated user does not match requested PlayFab ID',
                details: { authenticatedPlayFabId: authInfo.playFabId, requestedPlayFabId: expectedId }
            });
            return null;
        }

        req.authPlayFabId = authInfo.playFabId;
        req.authToken = authInfo.decodedToken;
        return authInfo.playFabId;
    }

    return {
        normalizePlayFabId,
        verifyLineAccessToken,
        verifyLineFriendshipStatus,
        verifyFirebaseIdToken,
        requireAuthenticatedPlayFabId
    };
}

module.exports = {
    normalizePlayFabId,
    verifyLineAccessToken,
    verifyLineFriendshipStatus,
    buildAuthHelpers
};

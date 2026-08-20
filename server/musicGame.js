const https = require('https');

const JOYSOUND_SABIKARA_URL = 'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3';
const CATALOG_COLLECTION = 'music_game_catalogs';
const CATALOG_DOCUMENT = 'sabikara';
const RESULTS_COLLECTION = 'music_game_results';
const SKIPS_COLLECTION = 'music_game_song_skips';
const ISSUES_COLLECTION = 'music_game_catalog_issues';
const RECENT_RESULTS_LIMIT = 160;
const MAX_RESULT_NAME_LENGTH = 60;
const MAX_SONG_TEXT_LENGTH = 180;
const VERIFIED_SAMPLE_SONGS = Object.freeze([
    Object.freeze({
        title: 'カブトムシ',
        artist: 'aiko',
        songNumber: '497445',
        catalog: 'sabikara'
    })
]);

function normalizeText(value, maxLength = MAX_SONG_TEXT_LENGTH) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function decodeHtml(value) {
    return String(value || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function htmlToText(value) {
    return normalizeText(decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')));
}

function normalizeSongNumber(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

function normalizeSongTitle(value) {
    return normalizeText(value)
        .replace(/^新曲\s*/u, '')
        .replace(/^\[サビカラ\]\s*/u, '')
        .trim();
}

function extractSearchResultSongs(html) {
    const songs = [];
    const seenSongNumbers = new Set();
    const tags = String(html || '').match(/<[^>]+>/g) || [];
    tags.forEach((tag) => {
        const songNumberMatch = tag.match(/\bdata-tracking-song_no\s*=\s*["']([^"']+)["']/i);
        const titleMatch = tag.match(/\bdata-tracking-title\s*=\s*["']([^"']+)["']/i);
        const artistMatch = tag.match(/\bdata-tracking-artist\s*=\s*["']([^"']+)["']/i);
        const songNumber = normalizeSongNumber(decodeHtml(songNumberMatch?.[1] || ''));
        const title = normalizeSongTitle(decodeHtml(titleMatch?.[1] || ''));
        const artist = normalizeText(decodeHtml(artistMatch?.[1] || ''));
        if (!songNumber || !title || !artist || seenSongNumbers.has(songNumber)) return;
        seenSongNumbers.add(songNumber);
        songs.push({ title, artist, songNumber, catalog: 'sabikara' });
    });
    return songs;
}

function getJoysoundSearchPageUrl(pageNumber) {
    const page = Number.parseInt(pageNumber, 10);
    if (!Number.isFinite(page) || page <= 1) return JOYSOUND_SABIKARA_URL;
    const url = new URL(JOYSOUND_SABIKARA_URL);
    url.searchParams.set('page', String(page));
    return url.href;
}

function parseOfficialTotal(html) {
    const sources = [String(html || ''), htmlToText(html)];
    for (const source of sources) {
        const match = source.match(/曲\s*一覧\s*[（(]\s*([0-9,]+)\s*件\s*[）)]/u)
            || source.match(/曲\s*[（(]\s*([0-9,]+)\s*件\s*[）)]/u);
        if (match) {
            const total = Number.parseInt(match[1].replace(/,/g, ''), 10) || 0;
            if (total > 0) return total;
        }
    }
    return 0;
}

function requestText(url, redirectsRemaining = 3) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 30000
        }, (response) => {
            const status = Number(response.statusCode || 0);
            const location = String(response.headers.location || '');
            if (status >= 300 && status < 400 && location && redirectsRemaining > 0) {
                response.resume();
                requestText(new URL(location, url).href, redirectsRemaining - 1).then(resolve, reject);
                return;
            }
            if (status < 200 || status >= 300) {
                response.resume();
                reject(new Error(`JoysoundHttp${status || 'Unknown'}`));
                return;
            }
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        request.on('timeout', () => request.destroy(new Error('JoysoundRequestTimeout')));
        request.on('error', reject);
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(operation, attempts = 3) {
    let lastError = null;
    for (let index = 0; index < attempts; index += 1) {
        try {
            return await operation(index);
        } catch (error) {
            lastError = error;
            if (index + 1 < attempts) await wait(400 * (index + 1));
        }
    }
    throw lastError || new Error('JoysoundRequestFailed');
}

function validateCatalog(songs, officialTotal, collectedUrlCount) {
    const problems = [];
    const duplicateNumbers = [];
    const seenNumbers = new Set();
    (Array.isArray(songs) ? songs : []).forEach((song, index) => {
        const title = normalizeSongTitle(song?.title);
        const artist = normalizeText(song?.artist);
        const songNumber = normalizeSongNumber(song?.songNumber);
        if (!title || !artist || !songNumber) problems.push(`missing-required-fields:${index}`);
        if (songNumber && seenNumbers.has(songNumber)) duplicateNumbers.push(songNumber);
        if (songNumber) seenNumbers.add(songNumber);
    });
    const exportedCount = Array.isArray(songs) ? songs.length : 0;
    const success = officialTotal > 0
        && collectedUrlCount === officialTotal
        && exportedCount === officialTotal
        && problems.length === 0
        && duplicateNumbers.length === 0;
    return {
        generatedAt: new Date().toISOString(),
        officialTotal,
        collectedUrlCount,
        exportedCount,
        success,
        problems,
        duplicateNumbers,
        errors: []
    };
}

async function fetchJoysoundSabikaraCatalog({ fetchText = requestText, delayMs = 300 } = {}) {
    const initialHtml = await retry(() => fetchText(JOYSOUND_SABIKARA_URL));
    const officialTotal = parseOfficialTotal(initialHtml);
    if (!officialTotal) throw new Error('JoysoundOfficialTotalNotFound');
    const songs = [];
    const totalPages = Math.ceil(officialTotal / 20);

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const pageUrl = getJoysoundSearchPageUrl(pageNumber);
        const html = pageNumber === 1 ? initialHtml : await retry(() => fetchText(pageUrl));
        const pageSongs = extractSearchResultSongs(html);
        if (!pageSongs.length) throw new Error(`JoysoundSearchPageEmpty:${pageNumber}`);
        songs.push(...pageSongs);
        if (pageNumber < totalPages) await wait(delayMs);
    }

    const validation = validateCatalog(songs, officialTotal, songs.length);
    if (!validation.success) {
        throw new Error(`JoysoundValidationFailed:${JSON.stringify(validation)}`);
    }
    return { songs, validation };
}

function getTokyoDayKey(value = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date(value));
    const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${mapped.year}-${mapped.month}-${mapped.day}`;
}

function normalizeParticipantName(value) {
    return normalizeText(value, MAX_RESULT_NAME_LENGTH);
}

function normalizeMode(value) {
    const mode = String(value || '').trim();
    return ['sabikara_free', 'sabikara_competitive', 'intro_quiz'].includes(mode) ? mode : '';
}

function normalizeOutcome(value) {
    const outcome = String(value || '').trim();
    return ['correct', 'incorrect', 'pass'].includes(outcome) ? outcome : '';
}

function normalizeScore(value) {
    const raw = String(value ?? '').trim();
    if (!/^\d{1,3}(?:\.\d{1,3})?$/.test(raw)) return null;
    const score = Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > 100) return null;
    return score;
}

function normalizeClientResultId(value) {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(id) ? id : '';
}

function validateResultInput(input) {
    const mode = normalizeMode(input?.mode);
    const participantId = normalizeText(input?.participantId, 128);
    const participantName = normalizeParticipantName(input?.participantName);
    const songNumber = normalizeSongNumber(input?.songNumber);
    const clientResultId = normalizeClientResultId(input?.clientResultId);
    if (!mode) throw new Error('InvalidMusicGameMode');
    if (!participantId || !participantName) throw new Error('ParticipantRequired');
    if (!songNumber) throw new Error('SongRequired');
    if (!clientResultId) throw new Error('InvalidClientResultId');
    if (mode === 'intro_quiz') {
        const outcome = normalizeOutcome(input?.outcome);
        if (!outcome) throw new Error('QuizOutcomeRequired');
        return { mode, participantId, participantName, songNumber, clientResultId, outcome };
    }
    const score = normalizeScore(input?.score);
    if (score === null) throw new Error('ScoreMustBeBetween0And100WithUpTo3Decimals');
    return { mode, participantId, participantName, songNumber, clientResultId, score };
}

function serializeDocument(snapshot) {
    const data = snapshot?.data ? snapshot.data() : {};
    return { id: snapshot?.id || '', ...data };
}

async function readTodayResults(firestore, dayKey) {
    const collection = firestore.collection(RESULTS_COLLECTION);
    let snapshot;
    try {
        snapshot = await collection.where('dayKey', '==', dayKey).orderBy('playedAtMs', 'desc').limit(RECENT_RESULTS_LIMIT).get();
    } catch (error) {
        snapshot = await collection.where('dayKey', '==', dayKey).limit(RECENT_RESULTS_LIMIT).get();
    }
    return (snapshot?.docs || []).map(serializeDocument).sort((left, right) => Number(right.playedAtMs || 0) - Number(left.playedAtMs || 0));
}

async function readCatalog(firestore) {
    const manifestRef = firestore.collection(CATALOG_COLLECTION).doc(CATALOG_DOCUMENT);
    const manifestSnap = await manifestRef.get();
    const manifest = manifestSnap.exists ? manifestSnap.data() : null;
    const activeVersion = normalizeText(manifest?.activeVersion, 160);
    if (!activeVersion) {
        return {
            songs: VERIFIED_SAMPLE_SONGS.map((song) => ({ ...song })),
            manifest: {
                version: 'verified-sample',
                updatedAt: null,
                songCount: VERIFIED_SAMPLE_SONGS.length,
                validationSuccess: false,
                source: 'verified-sample',
                status: 'sample'
            }
        };
    }
    const songsSnap = await manifestRef.collection('versions').doc(activeVersion).collection('songs').get();
    const songs = (songsSnap?.docs || [])
        .map((snapshot) => snapshot.data())
        .map((song) => ({
            title: normalizeSongTitle(song?.title),
            artist: normalizeText(song?.artist),
            songNumber: normalizeSongNumber(song?.songNumber),
            catalog: 'sabikara'
        }))
        .filter((song) => song.title && song.artist && song.songNumber);
    if (!songs.length) throw new Error('ActiveMusicCatalogIsEmpty');
    return {
        songs,
        manifest: {
            version: activeVersion,
            updatedAt: manifest?.updatedAt || null,
            songCount: Number(manifest?.songCount || songs.length),
            validationSuccess: manifest?.validationSuccess === true,
            source: 'joysound',
            status: manifest?.validationSuccess === true ? 'ready' : 'error'
        }
    };
}

async function publishCatalog(firestore, admin, songs, validation, staffPlayFabId) {
    const manifestRef = firestore.collection(CATALOG_COLLECTION).doc(CATALOG_DOCUMENT);
    const version = new Date().toISOString().replace(/[:.]/g, '-');
    const versionRef = manifestRef.collection('versions').doc(version);
    const now = new Date();
    const chunks = [];
    for (let index = 0; index < songs.length; index += 400) chunks.push(songs.slice(index, index + 400));
    await versionRef.set({
        version,
        officialTotal: validation.officialTotal,
        exportedCount: validation.exportedCount,
        validationSuccess: true,
        createdAt: now.toISOString(),
        createdBy: staffPlayFabId
    });
    for (const chunk of chunks) {
        const batch = firestore.batch();
        chunk.forEach((song) => {
            batch.set(versionRef.collection('songs').doc(song.songNumber), {
                title: song.title,
                artist: song.artist,
                songNumber: song.songNumber,
                catalog: 'sabikara'
            });
        });
        await batch.commit();
    }
    await versionRef.set({
        publishedAt: now.toISOString(),
        publishedAtServer: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await manifestRef.set({
        activeVersion: version,
        version,
        updatedAt: now.toISOString(),
        updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: staffPlayFabId,
        songCount: songs.length,
        validationSuccess: true,
        validation: {
            officialTotal: validation.officialTotal,
            collectedUrlCount: validation.collectedUrlCount,
            exportedCount: validation.exportedCount,
            success: true
        }
    }, { merge: true });
    return { version, songCount: songs.length };
}

function initializeMusicGameRoutes(app, deps) {
    const { firestore, admin } = deps || {};
    if (!firestore || !admin) {
        throw new Error('MusicGame routes require Firestore and Firebase Admin');
    }
    const staffPlayFabId = 'staff-portal';
    let refreshPromise = null;

    app.get('/api/troy-music-game/bootstrap', async (req, res) => {
        try {
            const dayKey = getTokyoDayKey();
            const [{ songs, manifest }, results] = await Promise.all([
                readCatalog(firestore),
                readTodayResults(firestore, dayKey)
            ]);
            res.json({
                staffPlayFabId,
                dayKey,
                participants: [],
                participantSource: 'guest-only',
                songs,
                manifest,
                results
            });
        } catch (error) {
            res.status(500).json({ error: 'FailedToLoadMusicGame', details: error?.message || String(error) });
        }
    });

    app.post('/api/troy-music-game/results', async (req, res) => {
        try {
            const input = validateResultInput(req.body || {});
            const { songs } = await readCatalog(firestore);
            const song = songs.find((entry) => entry.songNumber === input.songNumber);
            if (!song) return res.status(400).json({ error: 'Selected song is not in the active catalog' });
            const resultRef = firestore.collection(RESULTS_COLLECTION).doc(input.clientResultId);
            const existing = await resultRef.get();
            if (existing.exists) return res.json({ result: serializeDocument(existing), alreadySaved: true });
            const playedAtMs = Date.now();
            const result = {
                ...input,
                title: song.title,
                artist: song.artist,
                catalog: 'sabikara',
                dayKey: getTokyoDayKey(playedAtMs),
                playedAt: new Date(playedAtMs).toISOString(),
                playedAtMs,
                createdBy: staffPlayFabId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: new Date(playedAtMs).toISOString(),
                updatedBy: staffPlayFabId
            };
            try {
                await resultRef.create(result);
            } catch (error) {
                const concurrent = await resultRef.get();
                if (!concurrent.exists) throw error;
                return res.json({ result: serializeDocument(concurrent), alreadySaved: true });
            }
            res.status(201).json({ result: { id: resultRef.id, ...result }, alreadySaved: false });
        } catch (error) {
            res.status(400).json({ error: 'FailedToSaveMusicGameResult', details: error?.message || String(error) });
        }
    });

    app.post('/api/troy-music-game/results/update', async (req, res) => {
        const resultId = normalizeClientResultId(req.body?.resultId);
        if (!resultId) return res.status(400).json({ error: 'InvalidResultId' });
        try {
            const resultRef = firestore.collection(RESULTS_COLLECTION).doc(resultId);
            const existing = await resultRef.get();
            if (!existing.exists) return res.status(404).json({ error: 'MusicGameResultNotFound' });
            const result = existing.data();
            if (result?.voidedAt) return res.status(409).json({ error: 'VoidedMusicGameResultCannotBeEdited' });
            const patch = {
                updatedAt: new Date().toISOString(),
                updatedBy: staffPlayFabId,
                updatedAtServer: admin.firestore.FieldValue.serverTimestamp()
            };
            if (result.mode === 'intro_quiz') {
                const outcome = normalizeOutcome(req.body?.outcome);
                if (!outcome) return res.status(400).json({ error: 'QuizOutcomeRequired' });
                patch.outcome = outcome;
            } else {
                const score = normalizeScore(req.body?.score);
                if (score === null) return res.status(400).json({ error: 'ScoreMustBeBetween0And100WithUpTo3Decimals' });
                patch.score = score;
            }
            await resultRef.update(patch);
            res.json({ result: { id: resultId, ...result, ...patch } });
        } catch (error) {
            res.status(500).json({ error: 'FailedToUpdateMusicGameResult', details: error?.message || String(error) });
        }
    });

    app.post('/api/troy-music-game/results/void-latest', async (req, res) => {
        try {
            const results = await readTodayResults(firestore, getTokyoDayKey());
            const latest = results.find((result) => !result.voidedAt);
            if (!latest) return res.status(404).json({ error: 'NoActiveMusicGameResultToVoid' });
            const resultRef = firestore.collection(RESULTS_COLLECTION).doc(latest.id);
            const current = await resultRef.get();
            if (!current.exists) return res.status(404).json({ error: 'MusicGameResultNotFound' });
            if (current.data()?.voidedAt) return res.json({ result: serializeDocument(current), alreadyVoided: true });
            const patch = {
                voidedAt: new Date().toISOString(),
                voidedBy: staffPlayFabId,
                voidedAtServer: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: new Date().toISOString(),
                updatedBy: staffPlayFabId
            };
            await resultRef.update(patch);
            res.json({ result: { ...latest, ...patch }, alreadyVoided: false });
        } catch (error) {
            res.status(500).json({ error: 'FailedToVoidMusicGameResult', details: error?.message || String(error) });
        }
    });

    app.post('/api/troy-music-game/skip', async (req, res) => {
        const reason = String(req.body?.reason || '').trim();
        const songNumber = normalizeSongNumber(req.body?.songNumber);
        const allowedReasons = new Set(['unknown_song', 'cannot_sing', 'not_found_on_joysound', 'other']);
        if (!songNumber || !allowedReasons.has(reason)) return res.status(400).json({ error: 'InvalidSongSkip' });
        try {
            const { songs } = await readCatalog(firestore);
            const song = songs.find((entry) => entry.songNumber === songNumber);
            if (!song) return res.status(400).json({ error: 'Selected song is not in the active catalog' });
            const report = {
                songNumber: song.songNumber,
                title: song.title,
                artist: song.artist,
                reason,
                note: normalizeText(req.body?.note, 300),
                reportedAt: new Date().toISOString(),
                reportedBy: staffPlayFabId
            };
            await firestore.collection(SKIPS_COLLECTION).add(report);
            if (reason === 'not_found_on_joysound') await firestore.collection(ISSUES_COLLECTION).add(report);
            res.status(201).json({ report, requiresCatalogReview: reason === 'not_found_on_joysound' });
        } catch (error) {
            res.status(500).json({ error: 'FailedToRecordSongSkip', details: error?.message || String(error) });
        }
    });

    app.post('/api/troy-music-game/catalog/refresh', async (req, res) => {
        if (refreshPromise) return res.status(409).json({ error: 'MusicCatalogRefreshAlreadyRunning' });
        refreshPromise = (async () => {
            const { songs, validation } = await fetchJoysoundSabikaraCatalog();
            const publishResult = await publishCatalog(firestore, admin, songs, validation, staffPlayFabId);
            return { ...publishResult, validation };
        })();
        try {
            const result = await refreshPromise;
            res.json({ status: 'published', ...result });
        } catch (error) {
            res.status(502).json({
                error: 'MusicCatalogRefreshFailed',
                details: error?.message || String(error),
                currentCatalogRetained: true
            });
        } finally {
            refreshPromise = null;
        }
    });
}

module.exports = {
    CATALOG_COLLECTION,
    CATALOG_DOCUMENT,
    RESULTS_COLLECTION,
    VERIFIED_SAMPLE_SONGS,
    extractSearchResultSongs,
    fetchJoysoundSabikaraCatalog,
    getJoysoundSearchPageUrl,
    getTokyoDayKey,
    initializeMusicGameRoutes,
    normalizeScore,
    parseOfficialTotal,
    validateCatalog,
    validateResultInput
};

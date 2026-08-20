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

function isAllowedJoysoundUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'www.joysound.com' && url.pathname.startsWith('/web/search/song');
    } catch {
        return false;
    }
}

function resolveJoysoundUrl(value, baseUrl = JOYSOUND_SABIKARA_URL) {
    try {
        const url = new URL(value, baseUrl);
        return isAllowedJoysoundUrl(url.href) ? url.href : '';
    } catch {
        return '';
    }
}

function extractHrefs(html) {
    const hrefs = [];
    const pattern = /href\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = pattern.exec(String(html || '')))) {
        hrefs.push(decodeHtml(match[1]));
    }
    return hrefs;
}

function extractSongDetailUrls(html, baseUrl) {
    const seen = new Set();
    return extractHrefs(html)
        .map((href) => resolveJoysoundUrl(href, baseUrl))
        .filter((href) => /^https:\/\/www\.joysound\.com\/web\/search\/song\/\d+(?:[?#].*)?$/i.test(href))
        .filter((href) => {
            const clean = href.replace(/[?#].*$/, '');
            if (seen.has(clean)) return false;
            seen.add(clean);
            return true;
        });
}

function extractSearchPageUrls(html, baseUrl) {
    const seen = new Set();
    return extractHrefs(html)
        .map((href) => resolveJoysoundUrl(href, baseUrl))
        .filter((href) => {
            try {
                const url = new URL(href);
                return url.pathname === '/web/search/song' && url.searchParams.get('genreCd') === '23700001' && url.searchParams.get('searchType') === '3';
            } catch {
                return false;
            }
        })
        .filter((href) => {
            if (seen.has(href)) return false;
            seen.add(href);
            return true;
        });
}

function parseOfficialTotal(html) {
    const text = htmlToText(html);
    const match = text.match(/曲一覧\s*\(\s*([0-9,]+)件\s*\)/u) || text.match(/曲\s*\(\s*([0-9,]+)件\s*\)/u);
    return match ? Number.parseInt(match[1].replace(/,/g, ''), 10) || 0 : 0;
}

function parseSongDetail(html, url) {
    const source = String(html || '');
    const titleMatch = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const artistMatch = source.match(/歌手名[\s\S]{0,420}?<td\b[^>]*>([\s\S]*?)<\/td>/i);
    const text = htmlToText(source);
    const numberMatch = text.match(/曲番号\s*[:：]?\s*([0-9][0-9\s-]*)/u);
    const title = normalizeSongTitle(htmlToText(titleMatch?.[1] || ''));
    const artist = normalizeText(htmlToText(artistMatch?.[1] || ''));
    const songNumber = normalizeSongNumber(numberMatch?.[1] || '');
    if (!title || !artist || !songNumber) {
        throw new Error(`JoysoundSongParseFailed:${url}`);
    }
    return { title, artist, songNumber, catalog: 'sabikara' };
}

function requestText(url, redirectsRemaining = 3) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'TROY-Music-Game-Catalog-Updater/1.0 (+https://troy-xetw.onrender.com)',
                'Accept-Language': 'ja-JP,ja;q=0.9'
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

async function mapWithConcurrency(values, concurrency, operation) {
    const results = new Array(values.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, async () => {
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await operation(values[index], index);
        }
    });
    await Promise.all(workers);
    return results;
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

async function collectSongDetailUrlsWithPlaywright(officialTotal) {
    let chromium;
    try {
        ({ chromium } = require('playwright'));
    } catch (error) {
        throw new Error(`JoysoundPaginationNeedsPlaywright:${error?.message || String(error)}`);
    }
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ locale: 'ja-JP' });
        await page.goto(JOYSOUND_SABIKARA_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const detailUrls = new Set();
        const maxPages = Math.ceil(officialTotal / 10) + 20;
        let previousSongSet = '';
        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
            const pageUrls = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
                .map((anchor) => anchor.href)
                .filter((href) => /^https:\/\/www\.joysound\.com\/web\/search\/song\/\d+(?:[?#].*)?$/i.test(href)));
            const pageSongSet = [...new Set(pageUrls.map((url) => url.replace(/[?#].*$/, '')))].sort().join('|');
            if (!pageSongSet || pageSongSet === previousSongSet) throw new Error('JoysoundPaginationRepeatedSongSet');
            previousSongSet = pageSongSet;
            pageUrls.forEach((url) => detailUrls.add(url.replace(/[?#].*$/, '')));
            if (detailUrls.size === officialTotal) return [...detailUrls];
            const moved = await page.evaluate((targetPageNumber) => {
                const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
                const candidates = [...document.querySelectorAll('button, a')];
                const nextPage = candidates.find((element) => (
                    normalize(element.textContent) === String(targetPageNumber)
                    && !element.hasAttribute('disabled')
                    && element.getAttribute('aria-disabled') !== 'true'
                )) || candidates.find((element) => {
                    const label = `${normalize(element.textContent)} ${normalize(element.getAttribute('aria-label'))}`;
                    return /次へ|next/i.test(label)
                        && !element.hasAttribute('disabled')
                        && element.getAttribute('aria-disabled') !== 'true';
                });
                if (!nextPage) return false;
                nextPage.click();
                return true;
            }, pageNumber + 1);
            if (!moved) break;
            await page.waitForTimeout(250);
        }
        throw new Error(`JoysoundPaginationIncomplete:${detailUrls.size}/${officialTotal}`);
    } finally {
        await browser.close();
    }
}

async function fetchJoysoundSabikaraCatalog({ fetchText = requestText, delayMs = 300 } = {}) {
    const initialHtml = await retry(() => fetchText(JOYSOUND_SABIKARA_URL));
    const officialTotal = parseOfficialTotal(initialHtml);
    if (!officialTotal) throw new Error('JoysoundOfficialTotalNotFound');

    const pageQueue = [JOYSOUND_SABIKARA_URL];
    const processedPages = new Set();
    const pageSongSets = new Set();
    const detailUrls = new Set();

    while (pageQueue.length) {
        const pageUrl = pageQueue.shift();
        if (!pageUrl || processedPages.has(pageUrl)) continue;
        const html = pageUrl === JOYSOUND_SABIKARA_URL ? initialHtml : await retry(() => fetchText(pageUrl));
        processedPages.add(pageUrl);
        const pageDetailUrls = extractSongDetailUrls(html, pageUrl);
        const pageKey = pageDetailUrls.slice().sort().join('|');
        if (pageKey && pageSongSets.has(pageKey)) {
            throw new Error('JoysoundPaginationRepeatedSongSet');
        }
        if (pageKey) pageSongSets.add(pageKey);
        pageDetailUrls.forEach((detailUrl) => detailUrls.add(detailUrl));
        extractSearchPageUrls(html, pageUrl).forEach((nextUrl) => {
            if (!processedPages.has(nextUrl) && !pageQueue.includes(nextUrl)) pageQueue.push(nextUrl);
        });
        if (processedPages.size > Math.ceil(officialTotal / 10) + 20) {
            throw new Error('JoysoundPaginationPageLimitExceeded');
        }
    }

    const urls = detailUrls.size === officialTotal
        ? [...detailUrls]
        : await collectSongDetailUrlsWithPlaywright(officialTotal);
    const songs = await mapWithConcurrency(urls, 2, async (detailUrl, index) => {
        if (index > 0) await wait(delayMs);
        const html = await retry(() => fetchText(detailUrl));
        return parseSongDetail(html, detailUrl);
    });
    const validation = validateCatalog(songs, officialTotal, urls.length);
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
    extractSearchPageUrls,
    extractSongDetailUrls,
    fetchJoysoundSabikaraCatalog,
    getTokyoDayKey,
    initializeMusicGameRoutes,
    normalizeScore,
    parseOfficialTotal,
    parseSongDetail,
    validateCatalog,
    validateResultInput
};

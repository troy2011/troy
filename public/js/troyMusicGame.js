const root = document.getElementById('troyMusicGameRoot');
const QUEUE_STORAGE_KEY = 'troy.music-game.participant-queue.v1';
const GUEST_STORAGE_KEY = 'troy.music-game.guests.v1';
const RECENT_LIMIT = 20;
const RECENT_ARTIST_LIMIT = 3;

const MODE_LABELS = {
    sabikara_free: 'サビカラ自由挑戦',
    sabikara_competitive: 'サビカラ真剣勝負',
    intro_quiz: 'イントロクイズ'
};

const DIFFICULTY_LABELS = {
    easy: '易しい（1〜100位）',
    slightly_easy: '少し易しい（1〜250位）',
    normal: '普通（1〜500位）',
    hard: '難しい（全曲）'
};

const DIFFICULTY_ICONS = {
    easy: '⚓',
    slightly_easy: '⛵',
    normal: '⚔',
    hard: '☠'
};

const SKIP_REASON_LABELS = {
    unknown_song: '知らない',
    cannot_sing: '歌えない',
    not_found_on_joysound: 'JOYSOUNDで見つからない',
    other: 'その他'
};

const state = {
    mode: 'sabikara_free',
    difficulty: 'easy',
    drawCount: 1,
    songs: [],
    manifest: null,
    exclusions: [],
    results: [],
    participants: [],
    guests: loadSessionList(GUEST_STORAGE_KEY),
    queue: loadLocalList(QUEUE_STORAGE_KEY),
    selectedSong: null,
    drawnSongChoices: [],
    selectedParticipant: null,
    scoreInput: '',
    quizOutcome: '',
    answerVisible: false,
    roundDrawnSongNumbers: [],
    pendingResultId: '',
    saved: false,
    saving: false,
    refreshingCatalog: false,
    message: '',
    messageIsError: false,
    staffLabel: 'ログイン不要',
    dayKey: ''
};

function $(id) {
    return document.getElementById(id);
}

function loadLocalList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed.map(normalizeParticipant).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function loadSessionList(key) {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed.map(normalizeParticipant).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function persistQueue() {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(state.queue));
}

function persistGuests() {
    sessionStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state.guests));
}

function normalizeParticipant(value) {
    const id = String(value?.id || value?.participantId || '').trim().slice(0, 128);
    const displayName = String(value?.displayName || value?.participantName || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!id || !displayName) return null;
    return { id, displayName, isGuest: value?.isGuest === true || id.startsWith('guest-') };
}

function normalizeSong(value) {
    const title = String(value?.title || '').replace(/\s+/g, ' ').trim();
    const artist = String(value?.artist || '').replace(/\s+/g, ' ').trim();
    const songNumber = String(value?.songNumber || '').replace(/\D/g, '');
    if (!title || !artist || !songNumber) return null;
    const popularityRank = Number(value?.popularityRank);
    return {
        title,
        artist,
        songNumber,
        popularityRank: Number.isInteger(popularityRank) && popularityRank > 0 ? popularityRank : 0,
        catalog: 'sabikara'
    };
}

function normalizeExclusion(value) {
    const song = normalizeSong(value);
    if (!song) return null;
    return {
        ...song,
        reason: String(value?.reason || '').replace(/\s+/g, ' ').trim(),
        excludedAt: String(value?.excludedAt || '').trim()
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createId(prefix) {
    const browserCrypto = window.crypto || null;
    const suffix = typeof browserCrypto?.randomUUID === 'function'
        ? browserCrypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${suffix}`;
}

function allParticipants() {
    const byId = new Map();
    [...state.participants, ...state.guests, ...state.queue].forEach((entry) => {
        const participant = normalizeParticipant(entry);
        if (participant && !byId.has(participant.id)) byId.set(participant.id, participant);
    });
    return [...byId.values()].sort((left, right) => left.displayName.localeCompare(right.displayName, 'ja'));
}

function activeResults() {
    return state.results
        .filter((result) => result && !result.voidedAt)
        .slice()
        .sort((left, right) => Number(right.playedAtMs || 0) - Number(left.playedAtMs || 0));
}

function setMessage(message, isError = false) {
    state.message = String(message || '');
    state.messageIsError = Boolean(isError);
}

function getScoreValue() {
    const raw = String(state.scoreInput || '').trim();
    if (!/^\d{1,3}(?:\.\d{1,3})?$/.test(raw)) return null;
    const score = Number(raw);
    return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function formatScore(value) {
    const score = Number(value);
    return Number.isFinite(score) ? score.toFixed(3) : '--';
}

function formatTime(value) {
    const ms = Number(value || 0);
    if (!ms) return '--:--';
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(ms));
}

function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--' : new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function formatPercent(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : '--';
}

function getSelectedParticipantStats() {
    const participant = state.selectedParticipant;
    if (!participant) return null;
    const rows = activeResults().filter((result) => String(result.participantId || '') === participant.id);
    const sabikara = rows.filter((result) => result.mode !== 'intro_quiz' && Number.isFinite(Number(result.score)));
    const intro = rows.filter((result) => result.mode === 'intro_quiz');
    const highest = sabikara.length ? Math.max(...sabikara.map((result) => Number(result.score))) : null;
    const average = sabikara.length
        ? sabikara.reduce((sum, result) => sum + Number(result.score), 0) / sabikara.length
        : null;
    const correct = intro.filter((result) => result.outcome === 'correct').length;
    return { participant, sabikara, intro, highest, average, correct };
}

function getDailySummary() {
    const rows = activeResults();
    const sabikara = rows.filter((result) => result.mode !== 'intro_quiz' && Number.isFinite(Number(result.score)));
    const intro = rows.filter((result) => result.mode === 'intro_quiz');
    const highestResult = sabikara.slice().sort((left, right) => Number(right.score) - Number(left.score))[0] || null;
    const totalScore = sabikara.reduce((sum, result) => sum + Number(result.score), 0);
    const correct = intro.filter((result) => result.outcome === 'correct').length;
    return {
        sabikaraCount: sabikara.length,
        sabikaraHighest: highestResult ? Number(highestResult.score) : null,
        sabikaraAverage: sabikara.length ? totalScore / sabikara.length : null,
        introCount: intro.length,
        introCorrect: correct,
        introRate: intro.length ? (correct / intro.length) * 100 : null,
        mvp: highestResult?.participantName || '--'
    };
}

function hasPopularityRanks() {
    return state.songs.length > 0 && state.songs.every((song) => Number.isInteger(song.popularityRank) && song.popularityRank > 0);
}

function songsForDifficulty(songs) {
    if (state.difficulty === 'hard') return songs;
    if (!hasPopularityRanks()) return [];
    return songs.filter((song) => {
        const rank = song.popularityRank;
        if (state.difficulty === 'easy') return rank <= 100;
        if (state.difficulty === 'slightly_easy') return rank <= 250;
        return rank <= 500;
    });
}

function buildDrawPools() {
    const songs = songsForDifficulty(state.songs.filter(Boolean));
    if (!songs.length) return [];
    const confirmed = activeResults();
    const recentSongNumbers = [...new Set(confirmed.slice(0, RECENT_LIMIT).map((result) => String(result.songNumber || '')).filter(Boolean))];
    const recentArtists = [...new Set(confirmed.slice(0, RECENT_ARTIST_LIMIT).map((result) => String(result.artist || '')).filter(Boolean))];
    const roundExcluded = new Set(state.roundDrawnSongNumbers);
    const roundCandidates = songs.filter((song) => !roundExcluded.has(song.songNumber));
    const baseCandidates = roundCandidates.length ? roundCandidates : songs;
    const withoutRecentSongs = baseCandidates.filter((song) => !recentSongNumbers.includes(song.songNumber));
    const recentCandidates = withoutRecentSongs.length ? withoutRecentSongs : baseCandidates;
    const withoutRecentArtists = recentCandidates.filter((song) => !recentArtists.includes(song.artist));
    const candidates = withoutRecentArtists.length ? withoutRecentArtists : recentCandidates;
    return [candidates, recentCandidates, baseCandidates, songs];
}

function pickRandomSongs(count) {
    const selected = [];
    const selectedSongNumbers = new Set();
    const requestedCount = Math.max(1, Math.min(5, Number.parseInt(count, 10) || 1));
    buildDrawPools().forEach((source) => {
        const pool = source.filter((song) => !selectedSongNumbers.has(song.songNumber));
        while (pool.length && selected.length < requestedCount) {
            const index = Math.floor(Math.random() * pool.length);
            const [song] = pool.splice(index, 1);
            selectedSongNumbers.add(song.songNumber);
            selected.push(song);
        }
    });
    return selected;
}

function canDrawSong() {
    if (state.saving || state.refreshingCatalog || state.saved) return false;
    return state.mode !== 'sabikara_competitive' || Boolean(state.selectedParticipant);
}

function canSelectParticipant() {
    return state.mode === 'sabikara_competitive' || Boolean(state.selectedSong);
}

function canSaveResult() {
    if (state.saving || state.saved || !state.selectedSong || !state.selectedParticipant) return false;
    return state.mode === 'intro_quiz' ? Boolean(state.quizOutcome) : getScoreValue() !== null;
}

function clearRound({ nextCompetitiveCandidate = false } = {}) {
    state.selectedSong = null;
    state.drawnSongChoices = [];
    state.scoreInput = '';
    state.quizOutcome = '';
    state.answerVisible = false;
    state.roundDrawnSongNumbers = [];
    state.pendingResultId = '';
    state.saved = false;
    state.selectedParticipant = nextCompetitiveCandidate && state.queue[0] ? state.queue[0] : null;
}

function changeMode(nextMode) {
    if (!MODE_LABELS[nextMode] || nextMode === state.mode) return;
    const hasProgress = state.selectedSong || state.selectedParticipant || state.scoreInput || state.quizOutcome;
    if (hasProgress && !window.confirm('現在のゲーム内容を破棄してモードを変更しますか？')) {
        render();
        return;
    }
    state.mode = nextMode;
    clearRound({ nextCompetitiveCandidate: nextMode === 'sabikara_competitive' });
    setMessage(`${MODE_LABELS[nextMode]}に切り替えました。`);
    render();
}

function changeDifficulty(nextDifficulty) {
    if (!DIFFICULTY_LABELS[nextDifficulty] || nextDifficulty === state.difficulty) return;
    if (nextDifficulty !== 'hard' && !hasPopularityRanks()) {
        setMessage('人気順位を取得するため、先にJOYSOUND最新データへ更新してください。', true);
        render();
        return;
    }
    const hasProgress = state.selectedSong || state.selectedParticipant || state.scoreInput || state.quizOutcome;
    if (hasProgress && !window.confirm('現在のゲーム内容を破棄して難易度を変更しますか？')) {
        render();
        return;
    }
    state.difficulty = nextDifficulty;
    clearRound({ nextCompetitiveCandidate: state.mode === 'sabikara_competitive' });
    setMessage(`難易度を「${DIFFICULTY_LABELS[nextDifficulty]}」に変更しました。`);
    render();
}

function changeDrawCount(nextDrawCount) {
    const drawCount = Number.parseInt(nextDrawCount, 10);
    if (![1, 3, 5].includes(drawCount) || drawCount === state.drawCount) return;
    const hasProgress = state.selectedSong || state.drawnSongChoices.length || state.selectedParticipant || state.scoreInput || state.quizOutcome;
    if (hasProgress && !window.confirm('現在のゲーム内容を破棄して抽選数を変更しますか？')) {
        render();
        return;
    }
    state.drawCount = drawCount;
    clearRound({ nextCompetitiveCandidate: state.mode === 'sabikara_competitive' });
    setMessage(`一度に${drawCount}曲を抽選します。`);
    render();
}

function selectDrawnSong(song) {
    state.selectedSong = song;
    state.drawnSongChoices = [];
    state.scoreInput = '';
    state.quizOutcome = '';
    state.answerVisible = state.mode !== 'intro_quiz';
    state.pendingResultId = '';
    state.saved = false;
}

function chooseDrawnSong(songNumber) {
    const song = state.drawnSongChoices.find((entry) => entry.songNumber === songNumber);
    if (!song) return;
    selectDrawnSong(song);
    setMessage(`「${song.title}」を歌う曲に選びました。`);
    render();
}

function drawSong() {
    if (!canDrawSong()) {
        setMessage('真剣勝負では、先に挑戦者を選択してください。', true);
        render();
        return;
    }
    const songs = pickRandomSongs(state.drawCount);
    if (!songs.length) {
        setMessage(`${DIFFICULTY_LABELS[state.difficulty]}に該当する曲がありません。難易度または最新データを確認してください。`, true);
        render();
        return;
    }
    songs.forEach((song) => {
        if (!state.roundDrawnSongNumbers.includes(song.songNumber)) state.roundDrawnSongNumbers.push(song.songNumber);
    });
    if (songs.length === 1) {
        selectDrawnSong(songs[0]);
        setMessage(state.mode === 'intro_quiz' ? '問題曲を抽選しました。答えはスタッフだけが確認できます。' : '曲を抽選しました。');
    } else {
        state.selectedSong = null;
        state.drawnSongChoices = songs;
        state.scoreInput = '';
        state.quizOutcome = '';
        state.answerVisible = false;
        state.pendingResultId = '';
        state.saved = false;
        setMessage(`${songs.length}曲を抽選しました。歌う曲を選んでください。`);
    }
    render();
}

async function skipSong() {
    if (!state.selectedSong || state.saving) return;
    const reason = String($('troyMusicGameSkipReason')?.value || '').trim();
    const note = String($('troyMusicGameSkipNote')?.value || '').trim();
    state.saving = true;
    render();
    try {
        if (reason) {
            await api('/api/troy-music-game/skip', { ...state.selectedSong, reason, note });
        }
        state.selectedSong = null;
        state.scoreInput = '';
        state.quizOutcome = '';
        state.answerVisible = false;
        state.pendingResultId = '';
        setMessage(reason ? '曲をスキップしました。確定履歴には追加されていません。' : '別の曲を引けます。確定履歴には追加されていません。');
    } catch (error) {
        setMessage(error.message || '曲スキップの記録に失敗しました。', true);
    } finally {
        state.saving = false;
        render();
    }
}

async function excludeSelectedSong() {
    const song = state.selectedSong;
    if (!song || state.saving) return;
    if (!window.confirm(`「${song.title} / ${song.artist}」を抽選対象から除外しますか？\nJOYSOUNDデータを更新しても、復帰するまで除外されたままです。`)) return;
    state.saving = true;
    render();
    try {
        const data = await api('/api/troy-music-game/catalog/exclusions', song);
        const exclusion = normalizeExclusion(data?.exclusion || song);
        if (exclusion) {
            state.exclusions = [...state.exclusions.filter((entry) => entry.songNumber !== exclusion.songNumber), exclusion]
                .sort((left, right) => `${left.title}\u0000${left.artist}`.localeCompare(`${right.title}\u0000${right.artist}`, 'ja'));
            state.songs = state.songs.filter((entry) => entry.songNumber !== exclusion.songNumber);
        }
        state.selectedSong = null;
        state.scoreInput = '';
        state.quizOutcome = '';
        state.answerVisible = false;
        state.pendingResultId = '';
        setMessage(`「${song.title}」を抽選対象から除外しました。`);
    } catch (error) {
        setMessage(error.message || '曲を除外できませんでした。', true);
    } finally {
        state.saving = false;
        render();
    }
}

async function restoreExcludedSong(songNumber) {
    const exclusion = state.exclusions.find((entry) => entry.songNumber === songNumber);
    if (!exclusion || state.saving) return;
    if (!window.confirm(`「${exclusion.title} / ${exclusion.artist}」を抽選対象に戻しますか？`)) return;
    state.saving = true;
    render();
    try {
        await api('/api/troy-music-game/catalog/exclusions/remove', { songNumber });
        await loadBootstrap();
        setMessage(`「${exclusion.title}」を抽選対象に戻しました。`);
    } catch (error) {
        setMessage(error.message || '曲を抽選対象に戻せませんでした。', true);
    } finally {
        state.saving = false;
        render();
    }
}

async function saveResult() {
    if (!canSaveResult()) {
        setMessage('曲・参加者・結果を確認してください。得点は0〜100、小数第3位までです。', true);
        render();
        return;
    }
    state.saving = true;
    state.pendingResultId = state.pendingResultId || createId('music-result');
    render();
    try {
        const payload = {
            clientResultId: state.pendingResultId,
            mode: state.mode,
            participantId: state.selectedParticipant.id,
            participantName: state.selectedParticipant.displayName,
            songNumber: state.selectedSong.songNumber
        };
        if (state.mode === 'intro_quiz') payload.outcome = state.quizOutcome;
        else payload.score = state.scoreInput;
        const data = await api('/api/troy-music-game/results', payload);
        const result = data?.result;
        if (result) {
            state.results = [result, ...state.results.filter((entry) => entry.id !== result.id && entry.clientResultId !== result.clientResultId)];
        }
        if (state.mode === 'sabikara_competitive' && state.queue[0]?.id === state.selectedParticipant.id) {
            state.queue.shift();
            persistQueue();
        }
        state.saved = true;
        setMessage(data?.alreadySaved ? '結果はすでに保存済みです。' : '結果を保存しました。');
    } catch (error) {
        setMessage(error.message || '結果を保存できませんでした。再試行してください。', true);
    } finally {
        state.saving = false;
        render();
    }
}

function nextGame() {
    if (!state.saved) return;
    const nextCompetitiveCandidate = state.mode === 'sabikara_competitive';
    clearRound({ nextCompetitiveCandidate });
    setMessage(nextCompetitiveCandidate && state.selectedParticipant
        ? `次の挑戦者は${state.selectedParticipant.displayName}です。曲を抽選できます。`
        : '次のゲームを開始できます。');
    render();
}

function selectParticipant(participantId) {
    const participant = allParticipants().find((entry) => entry.id === participantId) || null;
    state.selectedParticipant = participant;
    render();
}

function addGuest() {
    if (!canSelectParticipant()) {
        setMessage('このモードでは、曲を抽選してから参加者を選択してください。', true);
        render();
        return;
    }
    const name = String(window.prompt('ゲスト名を入力してください') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) return;
    const participant = { id: createId('guest'), displayName: name, isGuest: true };
    state.guests.push(participant);
    persistGuests();
    state.selectedParticipant = participant;
    setMessage(`${name}さんをゲストとして追加しました。`);
    render();
}

function addQueueParticipant() {
    const participant = state.selectedParticipant;
    if (!participant) {
        setMessage('先に参加者を選択してください。', true);
        render();
        return;
    }
    if (state.queue.some((entry) => entry.id === participant.id)) {
        setMessage(`${participant.displayName}さんはすでにキューに入っています。`, true);
        render();
        return;
    }
    state.queue.push(participant);
    persistQueue();
    setMessage(`${participant.displayName}さんを次の挑戦者キューに追加しました。`);
    render();
}

function removeQueueParticipant(participantId) {
    state.queue = state.queue.filter((entry) => entry.id !== participantId);
    persistQueue();
    render();
}

function useQueueHead() {
    const participant = state.queue[0] || null;
    if (!participant) return;
    state.selectedParticipant = participant;
    setMessage(`${participant.displayName}さんを挑戦者に選択しました。`);
    render();
}

async function editResult(resultId) {
    const result = activeResults().find((entry) => entry.id === resultId);
    if (!result) return;
    const label = result.mode === 'intro_quiz' ? '結果（correct / incorrect / pass）' : '得点（0〜100、小数第3位まで）';
    const current = result.mode === 'intro_quiz' ? result.outcome : formatScore(result.score);
    const value = String(window.prompt(label, current) || '').trim();
    if (!value) return;
    try {
        const payload = { resultId };
        if (result.mode === 'intro_quiz') payload.outcome = value;
        else payload.score = value;
        const data = await api('/api/troy-music-game/results/update', payload);
        if (data?.result) state.results = state.results.map((entry) => entry.id === resultId ? { ...entry, ...data.result } : entry);
        setMessage('結果を修正しました。');
    } catch (error) {
        setMessage(error.message || '結果を修正できませんでした。', true);
    }
    render();
}

async function voidLatestResult() {
    const latest = activeResults()[0];
    if (!latest) return;
    const summary = latest.mode === 'intro_quiz'
        ? `${latest.participantName} / ${latest.title} / ${latest.outcome}`
        : `${latest.participantName} / ${latest.title} / ${formatScore(latest.score)}点`;
    if (!window.confirm(`直前の確定結果を取り消しますか？\n${summary}`)) return;
    try {
        const data = await api('/api/troy-music-game/results/void-latest', {});
        if (data?.result?.id) state.results = state.results.map((entry) => entry.id === data.result.id ? { ...entry, ...data.result } : entry);
        setMessage(data?.alreadyVoided ? 'この結果はすでに取り消されています。' : '直前の確定結果を取り消しました。');
    } catch (error) {
        setMessage(error.message || '取消に失敗しました。', true);
    }
    render();
}

async function refreshCatalog() {
    if (state.refreshingCatalog) return;
    if (!window.confirm('JOYSOUND公式のサビカラデータを取得・検証して更新します。完了まで数分かかる場合があります。')) return;
    state.refreshingCatalog = true;
    setMessage('JOYSOUND公式データを取得・検証しています。完了までこの画面を閉じないでください。');
    render();
    try {
        const result = await api('/api/troy-music-game/catalog/refresh', {});
        const excludedSongCount = Number(result.excludedSongCount || 0);
        setMessage(`サビカラデータを更新しました（抽選対象 ${Number(result.songCount || 0).toLocaleString('ja-JP')}曲${excludedSongCount ? ` / 除外 ${excludedSongCount.toLocaleString('ja-JP')}曲` : ''}）。`);
        await loadBootstrap();
    } catch (error) {
        setMessage(`${error.message || 'サビカラデータを更新できませんでした。'} 現在の正常なデータは維持されています。`, true);
    } finally {
        state.refreshingCatalog = false;
        render();
    }
}

function participantOptions() {
    const selectedId = state.selectedParticipant?.id || '';
    return [
        '<option value="">参加者を選択</option>',
        ...allParticipants().map((participant) => `<option value="${escapeHtml(participant.id)}"${participant.id === selectedId ? ' selected' : ''}>${escapeHtml(participant.displayName)}${participant.isGuest ? '（ゲスト）' : ''}</option>`)
    ].join('');
}

function renderParticipantStats() {
    const stats = getSelectedParticipantStats();
    if (!stats) return '<div class="troy-music-game-participant-stat">参加者を選択すると、本日の成績を表示します。</div>';
    return `<div class="troy-music-game-participant-stat">
        <strong>${escapeHtml(stats.participant.displayName)}</strong><br>
        サビカラ: ${stats.sabikara.length}回 / 最高 ${stats.highest === null ? '--' : formatScore(stats.highest)} / 平均 ${stats.average === null ? '--' : formatScore(stats.average)}<br>
        イントロ: ${stats.intro.length}回 / 正解 ${stats.correct} / 正解率 ${stats.intro.length ? formatPercent((stats.correct / stats.intro.length) * 100) : '--'}
    </div>`;
}

function renderSong() {
    const song = state.selectedSong;
    if (!song && state.drawnSongChoices.length) {
        return `<div class="troy-music-game-song is-hidden-answer">
            <div class="troy-music-game-section-kicker">SONG CHOICES</div>
            <strong>${state.drawnSongChoices.length}曲から歌う曲を選択してください</strong>
            <span class="troy-music-game-small-note">選択後に参加者と結果を入力できます。</span>
            <div class="troy-music-game-choice-list">${state.drawnSongChoices.map((choice) => `<button type="button" data-action="choose-drawn-song" data-song-number="${escapeHtml(choice.songNumber)}"><strong>${escapeHtml(choice.title)}</strong><br><small>${escapeHtml(choice.artist)}${choice.popularityRank ? ` / 人気 ${escapeHtml(choice.popularityRank)}位` : ''}</small></button>`).join('')}</div>
        </div>`;
    }
    if (!song) return '<div class="troy-music-game-song"><span class="troy-music-game-song-empty">曲を抽選すると、ここに曲名・歌手・JOYSOUND曲番号を表示します。</span></div>';
    if (state.mode === 'intro_quiz' && !state.answerVisible) {
        return `<div class="troy-music-game-song is-hidden-answer">
            <div class="troy-music-game-section-kicker">INTRO QUIZ</div>
            <strong>問題曲を抽選しました</strong>
            <span class="troy-music-game-small-note">曲名・歌手は非表示です。</span>
            <strong>JOYSOUND 曲番号：${escapeHtml(song.songNumber)}</strong>
            <div class="troy-music-game-actions"><button type="button" data-action="show-answer" class="troy-music-game-primary">答えを見る</button></div>
        </div>`;
    }
    return `<div class="troy-music-game-song">
        <div class="troy-music-game-section-kicker">${state.mode === 'intro_quiz' ? 'ANSWER (STAFF ONLY)' : 'SELECTED SONG'}${song.popularityRank ? ` / 人気 ${song.popularityRank}位` : ''}</div>
        <h3>♪ ${escapeHtml(song.title)}</h3>
        <div class="troy-music-game-song-artist">${escapeHtml(song.artist)}</div>
        <div class="troy-music-game-song-number-block"><span class="troy-music-game-label">JOYSOUND 曲番号</span><div class="troy-music-game-song-number">${escapeHtml(song.songNumber)}</div></div>
        ${state.mode === 'intro_quiz' ? '<div class="troy-music-game-actions"><button type="button" data-action="hide-answer" class="troy-music-game-muted-button">答えを隠す</button></div>' : ''}
    </div>`;
}

function renderResultInput() {
    if (!state.selectedSong || !state.selectedParticipant || state.saved) return '';
    if (state.mode === 'intro_quiz') {
        return `<div class="troy-music-game-field">
            <span>回答結果</span>
            <div class="troy-music-game-choice-list">
                ${['correct', 'incorrect', 'pass'].map((outcome) => `<button type="button" data-action="set-outcome" data-outcome="${outcome}" class="${state.quizOutcome === outcome ? 'is-selected' : ''}">${({ correct: '正解', incorrect: '不正解', pass: 'パス' })[outcome]}</button>`).join('')}
            </div>
        </div>`;
    }
    return `<label class="troy-music-game-field" for="troyMusicGameScore">
        <span>サビカラ得点（0〜100、小数第3位まで）</span>
        <input id="troyMusicGameScore" type="text" inputmode="decimal" autocomplete="off" placeholder="96.342" value="${escapeHtml(state.scoreInput)}">
    </label>`;
}

function renderQueue() {
    if (!state.queue.length) return '<div class="troy-music-game-small-note">次の挑戦者はまだいません。</div>';
    return `<div class="troy-music-game-queue">${state.queue.map((participant, index) => `<div class="troy-music-game-queue-item">
        <span>${index + 1}. ${escapeHtml(participant.displayName)}${participant.isGuest ? '（ゲスト）' : ''}</span>
        <button type="button" data-action="remove-queue" data-participant-id="${escapeHtml(participant.id)}" aria-label="${escapeHtml(participant.displayName)}をキューから削除">削除</button>
    </div>`).join('')}</div>`;
}

function renderHistory() {
    const rows = activeResults().slice(0, 20);
    if (!rows.length) return '<div class="troy-music-game-small-note">本日の確定結果はまだありません。</div>';
    return `<div class="troy-music-game-history">${rows.map((result) => {
        const score = result.mode === 'intro_quiz' ? ({ correct: '正解', incorrect: '不正解', pass: 'パス' })[result.outcome] || result.outcome : `${formatScore(result.score)}点`;
        return `<div class="troy-music-game-history-item">
            <time>${escapeHtml(formatTime(result.playedAtMs))}</time>
            <div class="troy-music-game-history-main">
                <strong>${escapeHtml(score)}　${escapeHtml(result.participantName || '')}</strong>
                <span>${escapeHtml(MODE_LABELS[result.mode] || result.mode || '')} / ${escapeHtml(result.title || '')}</span>
            </div>
            <div class="troy-music-game-history-actions"><button type="button" data-action="edit-result" data-result-id="${escapeHtml(result.id)}">編集</button></div>
        </div>`;
    }).join('')}</div>`;
}

function renderExclusionManager() {
    const exclusions = state.exclusions;
    return `<details class="troy-music-game-exclusions">
        <summary>抽選除外リスト（${exclusions.length}曲）</summary>
        <p class="troy-music-game-small-note">除外した曲はJOYSOUND最新データへの更新後も対象外です。</p>
        ${exclusions.length ? `<div class="troy-music-game-exclusion-list">${exclusions.map((exclusion) => `<div class="troy-music-game-exclusion-item">
            <span><strong>${escapeHtml(exclusion.title)}</strong><small>${escapeHtml(exclusion.artist)} / ${escapeHtml(exclusion.songNumber)}</small></span>
            <button type="button" data-action="restore-excluded-song" data-song-number="${escapeHtml(exclusion.songNumber)}" ${state.saving ? 'disabled' : ''}>復帰</button>
        </div>`).join('')}</div>` : '<p class="troy-music-game-small-note">除外曲はありません。</p>'}
    </details>`;
}

function renderSummary() {
    const summary = getDailySummary();
    return `<details class="troy-music-game-panel troy-music-game-summary">
        <summary>本日の結果を見る</summary>
        <div class="troy-music-game-summary-grid">
            <div><span>サビカラ挑戦</span><strong>${summary.sabikaraCount}回</strong></div>
            <div><span>サビカラ最高</span><strong>${summary.sabikaraHighest === null ? '--' : formatScore(summary.sabikaraHighest)}</strong></div>
            <div><span>サビカラ平均</span><strong>${summary.sabikaraAverage === null ? '--' : formatScore(summary.sabikaraAverage)}</strong></div>
            <div><span>イントロ回答</span><strong>${summary.introCount}回</strong></div>
            <div><span>イントロ正解率</span><strong>${summary.introRate === null ? '--' : formatPercent(summary.introRate)}</strong></div>
            <div><span>本日のMVP</span><strong>${escapeHtml(summary.mvp)}</strong></div>
        </div>
    </details>`;
}

function render() {
    if (!root) return;
    const manifest = state.manifest || {};
    const selectedSong = state.selectedSong;
    const selectionDisabled = !canSelectParticipant() || state.saved || state.saving;
    const drawText = selectedSong || state.drawnSongChoices.length ? '別の候補を抽選する' : (state.mode === 'intro_quiz' ? '🎲 問題曲を抽選する' : '🎲 曲を抽選する');
    const lastResult = activeResults()[0];
    const popularityRanksAvailable = hasPopularityRanks();
    const catalogWarnings = [];
    if (manifest.source === 'verified-sample') catalogWarnings.push('確認済みのサンプル曲のみを表示しています。営業開始前にJOYSOUND最新データへ更新してください。');
    if (!popularityRanksAvailable) catalogWarnings.push('難易度別の抽選には、JOYSOUND最新データへの更新が必要です。');
    const catalogWarning = catalogWarnings.join(' ');
    root.innerHTML = `
        <header class="troy-music-game-header">
            <div class="troy-music-game-brand">
                <img src="/assets/ui/icons/044.png" class="troy-music-game-brand-mic" alt="カラオケマイク">
                <div>
                    <div class="troy-music-game-kicker">TROY STAFF TABLET</div>
                    <h1>TROY MUSIC GAME</h1>
                    <p class="troy-music-game-subtitle">✦ スタッフ用タブレット操作画面 ✦</p>
                </div>
            </div>
            <div class="troy-music-game-header-aside">
                <div class="troy-music-game-auth">${escapeHtml(state.staffLabel)}</div>
                <div class="troy-music-game-compass" aria-hidden="true">✥</div>
            </div>
        </header>
        ${state.message ? `<p class="troy-music-game-message${state.messageIsError ? ' is-error' : ''}" role="status">${escapeHtml(state.message)}</p>` : ''}
        <div class="troy-music-game-board">
            <section class="troy-music-game-mode-bar" aria-label="ゲーム設定">
                <span class="troy-music-game-mode-label">✧ モード</span>
                <div class="troy-music-game-mode-row" aria-label="ゲームモードを選択">
                    ${Object.entries(MODE_LABELS).map(([value, label]) => `<button type="button" data-action="set-mode" data-mode="${value}" class="troy-music-game-mode-button${state.mode === value ? ' is-selected' : ''}" aria-pressed="${state.mode === value}"><span aria-hidden="true">${({ sabikara_free: '🎲', sabikara_competitive: '⚔', intro_quiz: '♫' })[value]}</span>${escapeHtml(label)}</button>`).join('')}
                </div>
                <span class="troy-music-game-mode-label">⌁ 難易度</span>
                <div class="troy-music-game-difficulty-row" aria-label="難易度を選択">
                    ${Object.entries(DIFFICULTY_LABELS).map(([value, label]) => `<button type="button" data-action="set-difficulty" data-difficulty="${value}" class="troy-music-game-difficulty-button${state.difficulty === value ? ' is-selected' : ''}" aria-pressed="${state.difficulty === value}" ${value !== 'hard' && !popularityRanksAvailable ? 'disabled' : ''}><span aria-hidden="true">${DIFFICULTY_ICONS[value]}</span>${escapeHtml(label)}</button>`).join('')}
                </div>
            </section>
            <div class="troy-music-game-grid">
                <section class="troy-music-game-main-column">
                    <section class="troy-music-game-panel troy-music-game-play-panel">
                    <div class="troy-music-game-panel-body">
                        <div class="troy-music-game-field">
                            <span>一度に抽選する曲数</span>
                            <div class="troy-music-game-choice-list">${[1, 3, 5].map((count) => `<button type="button" data-action="set-draw-count" data-draw-count="${count}" class="${state.drawCount === count ? 'is-selected' : ''}" aria-pressed="${state.drawCount === count}">${count}曲</button>`).join('')}</div>
                        </div>
                        <div class="troy-music-game-draw-row"><button type="button" data-action="draw-song" class="troy-music-game-primary troy-music-game-draw-button" ${canDrawSong() ? '' : 'disabled'}>${drawText}</button></div>
                        ${renderSong()}
                        <div class="troy-music-game-field">
                            <span class="troy-music-game-control-label">${state.mode === 'intro_quiz' ? '♟ 回答者' : '♟ 挑戦者'}</span>
                            <div class="troy-music-game-field-row">
                                <select id="troyMusicGameParticipant" ${selectionDisabled ? 'disabled' : ''}>${participantOptions()}</select>
                                <button type="button" data-action="add-guest" ${selectionDisabled ? 'disabled' : ''}>＋ ゲスト</button>
                            </div>
                            <p class="troy-music-game-state-note">${state.mode === 'sabikara_competitive' ? '真剣勝負は挑戦者を選ぶと曲を抽選できます。' : state.mode === 'intro_quiz' ? '問題曲を抽選してから回答者を選択します。' : '曲を抽選してから挑戦者を選択します。'}</p>
                        </div>
                        ${renderParticipantStats()}
                        ${selectedSong && !state.saved ? `<section class="troy-music-game-skip">
                            <span class="troy-music-game-label">曲スキップ（任意）</span>
                            <select id="troyMusicGameSkipReason"><option value="">理由を記録せず別の曲を引く</option>${Object.entries(SKIP_REASON_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
                            <input id="troyMusicGameSkipNote" type="text" maxlength="300" placeholder="その他のメモ（任意）">
                            <div class="troy-music-game-actions"><button type="button" data-action="skip-song" class="troy-music-game-muted-button" ${state.saving ? 'disabled' : ''}>別の曲を引く</button><button type="button" data-action="exclude-song" class="troy-music-game-danger" ${state.saving ? 'disabled' : ''}>この曲を抽選対象から除外</button></div>
                        </section>` : ''}
                        ${renderResultInput()}
                        ${state.saved ? `<div class="troy-music-game-actions troy-music-game-result-actions"><button type="button" data-action="next-game" class="troy-music-game-primary">次のゲームへ</button></div>` : `<div class="troy-music-game-actions troy-music-game-result-actions"><button type="button" data-action="save-result" class="troy-music-game-primary" ${canSaveResult() ? '' : 'disabled'}>${state.saving ? '保存中…' : '✓ 結果を確定'}</button></div>`}
                    </div>
                </section>
                </section>
                <aside class="troy-music-game-side-column">
                    <section class="troy-music-game-panel troy-music-game-history-panel">
                        <div class="troy-music-game-panel-head"><h2>↶ 本日の履歴</h2>${lastResult ? '<button type="button" data-action="void-latest" class="troy-music-game-danger">直前を取り消す</button>' : ''}</div>
                        <div class="troy-music-game-panel-body">${renderHistory()}</div>
                    </section>
                    <section class="troy-music-game-panel troy-music-game-catalog-panel">
                        <div class="troy-music-game-panel-head"><h2>▰ サビカラデータ</h2><span class="troy-music-game-history-meta">${manifest.validationSuccess ? '✅ 正常' : '⚠ 要確認'}</span></div>
                        <div class="troy-music-game-panel-body">
                            <div class="troy-music-game-catalog-status">
                                <div><span>抽選対象</span><strong>${Number(manifest.songCount || state.songs.length || 0).toLocaleString('ja-JP')}曲</strong></div>
                                <div><span>除外設定</span><strong>${Number(manifest.excludedSongCount || state.exclusions.length || 0).toLocaleString('ja-JP')}曲</strong></div>
                                <div><span>最終更新</span><strong>${escapeHtml(formatDateTime(manifest.updatedAt))}</strong></div>
                            </div>
                            ${catalogWarning ? `<p class="troy-music-game-catalog-warning">${escapeHtml(catalogWarning)}</p>` : ''}
                            <button type="button" data-action="refresh-catalog" class="troy-music-game-refresh-button" ${state.refreshingCatalog ? 'disabled' : ''}>${state.refreshingCatalog ? '更新中…' : '↻ JOYSOUND最新データに更新'}</button>
                            <p class="troy-music-game-small-note">取得・検証に失敗した場合、現在の正常なカタログは変更されません。</p>
                            ${renderExclusionManager()}
                        </div>
                    </section>
                <section class="troy-music-game-panel">
                    <div class="troy-music-game-panel-head"><h2>次の挑戦者キュー</h2><span class="troy-music-game-history-meta">${state.queue.length}名</span></div>
                    <div class="troy-music-game-panel-body">
                        ${renderQueue()}
                        <div class="troy-music-game-actions"><button type="button" data-action="queue-selected">選択中を追加</button><button type="button" data-action="use-queue-head" ${state.queue.length ? '' : 'disabled'}>先頭を使用</button></div>
                    </div>
                </section>
                </aside>
            </div>
            <div class="troy-music-game-board-summary">${renderSummary()}</div>
            <footer class="troy-music-game-board-footer">
                <span>⚓ 曲と参加者はモードごとに独立管理されます</span>
                <span>${escapeHtml(state.dayKey || '')}</span>
            </footer>
        </div>`;
}

async function api(path, body, method = 'POST') {
    const headers = { 'Content-Type': 'application/json' };
    const response = await fetch(path, {
        method,
        headers,
        ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) })
    });
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }
    if (!response.ok) {
        throw new Error(data?.details || data?.error || `通信に失敗しました（HTTP ${response.status}）`);
    }
    return data || {};
}

async function loadBootstrap() {
    const data = await api('/api/troy-music-game/bootstrap', null, 'GET');
    state.songs = (Array.isArray(data?.songs) ? data.songs : []).map(normalizeSong).filter(Boolean);
    state.manifest = data?.manifest || null;
    state.exclusions = (Array.isArray(data?.exclusions) ? data.exclusions : []).map(normalizeExclusion).filter(Boolean);
    state.results = Array.isArray(data?.results) ? data.results : [];
    state.participants = (Array.isArray(data?.participants) ? data.participants : []).map(normalizeParticipant).filter(Boolean);
    state.dayKey = String(data?.dayKey || '');
    if (!hasPopularityRanks() && state.difficulty !== 'hard') state.difficulty = 'hard';
}

function bindEvents() {
    root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.action;
        if (action === 'draw-song') drawSong();
        if (action === 'set-mode') changeMode(button.dataset.mode || '');
        if (action === 'set-difficulty') changeDifficulty(button.dataset.difficulty || '');
        if (action === 'set-draw-count') changeDrawCount(button.dataset.drawCount || '');
        if (action === 'choose-drawn-song') chooseDrawnSong(button.dataset.songNumber || '');
        if (action === 'skip-song') void skipSong();
        if (action === 'exclude-song') void excludeSelectedSong();
        if (action === 'show-answer') {
            state.answerVisible = true;
            render();
        }
        if (action === 'hide-answer') {
            state.answerVisible = false;
            render();
        }
        if (action === 'set-outcome') {
            state.quizOutcome = button.dataset.outcome || '';
            render();
        }
        if (action === 'save-result') void saveResult();
        if (action === 'next-game') nextGame();
        if (action === 'add-guest') addGuest();
        if (action === 'queue-selected') addQueueParticipant();
        if (action === 'use-queue-head') useQueueHead();
        if (action === 'remove-queue') removeQueueParticipant(button.dataset.participantId || '');
        if (action === 'edit-result') void editResult(button.dataset.resultId || '');
        if (action === 'void-latest') void voidLatestResult();
        if (action === 'refresh-catalog') void refreshCatalog();
        if (action === 'restore-excluded-song') void restoreExcludedSong(button.dataset.songNumber || '');
    });
    root.addEventListener('change', (event) => {
        if (event.target.id === 'troyMusicGameParticipant') selectParticipant(event.target.value);
    });
    root.addEventListener('input', (event) => {
        if (event.target.id === 'troyMusicGameScore') {
            state.scoreInput = event.target.value;
            const saveButton = root.querySelector('[data-action="save-result"]');
            if (saveButton) saveButton.disabled = !canSaveResult();
        }
    });
}

async function boot() {
    try {
        await loadBootstrap();
        setMessage('スタッフ用MUSIC GAMEを開始できます。');
    } catch (error) {
        setMessage(error.message || 'MUSIC GAMEを開始できませんでした。', true);
    }
    render();
}

if (root) {
    bindEvents();
    void boot();
}

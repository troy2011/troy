import {
    get,
    onDisconnect,
    onValue,
    ref,
    remove,
    serverTimestamp,
    set
} from 'firebase/database';

const ROOM_ROOT = 'navalPlunderRooms';
const SCHEMA_VERSION = 1;
const TICK_MS = 500;
const STALE_ROOM_MS = 10 * 60 * 1000;

let session = null;

function normalizeId(value) {
    return String(value || '').trim().toUpperCase();
}

function hashString(value) {
    return String(value || '').split('').reduce((hash, ch) => (
        ((hash << 5) - hash + ch.charCodeAt(0)) >>> 0
    ), 0).toString(36);
}

function buildRoomId(a, b) {
    return `np_${hashString([normalizeId(a), normalizeId(b)].sort().join('_'))}`;
}

function nowMs() {
    return Date.now();
}

function clone(value) {
    return JSON.parse(JSON.stringify(value || null));
}

function isFinishedOrStale(room) {
    if (!room) return true;
    if (room.status === 'finished') return true;
    const updatedAt = Number(room.updatedAt || room.createdAt || 0);
    return updatedAt > 0 && nowMs() - updatedAt > STALE_ROOM_MS;
}

function makePlayer(playFabId, displayName) {
    return {
        playFabId: normalizeId(playFabId),
        displayName: String(displayName || playFabId || 'Player')
    };
}

function createRoom({ roomId, uid, selfId, selfName, opponentId, opponentName }) {
    const createdAt = nowMs();
    return {
        schema: SCHEMA_VERSION,
        roomId,
        status: 'waiting',
        createdAt,
        updatedAt: createdAt,
        hostUid: uid,
        attackerId: normalizeId(selfId),
        defenderId: normalizeId(opponentId),
        players: {
            attacker: makePlayer(selfId, selfName),
            defender: makePlayer(opponentId, opponentName)
        },
        presence: {},
        pendingCommands: {},
        processedSeq: { attacker: 0, defender: 0 },
        state: null
    };
}

function getRole(room, playFabId) {
    const id = normalizeId(playFabId);
    if (normalizeId(room?.attackerId) === id) return 'attacker';
    if (normalizeId(room?.defenderId) === id) return 'defender';
    return '';
}

function roleToPerspective(role) {
    return role === 'defender' ? 'enemy' : 'player';
}

function roleToEngineSide(role) {
    return role === 'defender' ? 'enemy' : 'player';
}

function opponentNameFor(room, role, fallback) {
    const other = role === 'attacker' ? room?.players?.defender : room?.players?.attacker;
    return String(other?.displayName || fallback || other?.playFabId || '相手');
}

async function readRoom(roomRef) {
    const snap = await get(roomRef);
    return snap.exists() ? snap.val() : null;
}

async function writeRoom(roomRef, room) {
    const next = {
        ...room,
        updatedAt: nowMs()
    };
    await set(roomRef, next);
    return next;
}

function updateStatus(message) {
    const el = document.getElementById('navalPvpStatus');
    if (el) el.textContent = message || '';
}

function stopSession() {
    if (!session) return;
    if (typeof session.unsub === 'function') session.unsub();
    if (session.timer) clearInterval(session.timer);
    if (session.presenceRef) remove(session.presenceRef).catch(() => {});
    session = null;
}

function ensureStatusElement() {
    const shell = document.querySelector('#navalBattleModal .naval-shell');
    if (!shell || document.getElementById('navalPvpStatus')) return;
    const el = document.createElement('div');
    el.id = 'navalPvpStatus';
    el.className = 'naval-command-note';
    el.textContent = 'PvP接続中...';
    const commandNote = document.getElementById('navalCommandNote');
    shell.insertBefore(el, commandNote || shell.firstChild);
}

function getLocalBattleState() {
    return window.__navalBattleDebug?.serialize?.() || null;
}

async function publishLocalState(outcomeRoomPatch = {}) {
    if (!session?.isHost) return;
    const room = clone(session.room);
    if (!room) return;
    room.state = getLocalBattleState();
    if (room.state?.finished) {
        room.status = 'finished';
        room.finishedAt = nowMs();
    } else if (Object.keys(room.presence || {}).length >= 2) {
        room.status = 'active';
    }
    Object.assign(room, outcomeRoomPatch);
    session.room = await writeRoom(session.roomRef, room);
}

async function processHostCommands() {
    if (!session?.isHost || !session.room) return;
    const room = clone(session.room);
    const pending = room.pendingCommands || {};
    const processed = room.processedSeq || {};
    let changed = false;

    ['attacker', 'defender'].forEach((role) => {
        const command = pending[role];
        const seq = Number(command?.seq || 0);
        if (!command?.commandId || seq <= Number(processed[role] || 0)) return;
        const applied = window.__navalBattleDebug?.applyCommand?.(command.commandId, roleToEngineSide(role));
        processed[role] = seq;
        pending[role] = null;
        changed = true;
        if (!applied) {
            const state = getLocalBattleState();
            if (state) {
                state.logs = [`${role === 'attacker' ? '攻撃側' : '防衛側'}のコマンドは実行できなかった`, ...(state.logs || [])].slice(0, 30);
            }
        }
    });

    if (!changed) return;
    room.pendingCommands = pending;
    room.processedSeq = processed;
    room.state = getLocalBattleState();
    if (room.state?.finished) {
        room.status = 'finished';
        room.finishedAt = nowMs();
    }
    session.room = await writeRoom(session.roomRef, room);
}

async function hostTick() {
    if (!session?.isHost || !session.room) return;
    if (Object.keys(session.room.presence || {}).length < 2) {
        await publishLocalState();
        return;
    }
    await processHostCommands();
    if (session.room?.status === 'finished') return;
    window.__navalBattleDebug?.step?.();
    await publishLocalState();
}

async function sendCommand(commandId) {
    if (!session?.roomRef || !session.role || !commandId) return true;
    const room = await readRoom(session.roomRef);
    if (!room || room.status === 'finished') return true;
    const role = session.role;
    const pendingCommands = { ...(room.pendingCommands || {}) };
    const currentSeq = Number(pendingCommands[role]?.seq || room.processedSeq?.[role] || 0);
    pendingCommands[role] = {
        commandId,
        seq: currentSeq + 1,
        sentAt: nowMs(),
        uid: session.uid
    };
    await writeRoom(session.roomRef, { ...room, pendingCommands });
    updateStatus('コマンドを送信しました。相手の状態と同期中...');
    return true;
}

function applyRoomState(room) {
    if (!session || !room) return;
    session.room = room;
    session.role = getRole(room, session.selfId) || session.role;
    session.isHost = room.hostUid === session.uid;

    if (!room.state) {
        updateStatus('相手の参加を待っています。');
        return;
    }

    window.__navalBattleDebug?.applySnapshot?.(room.state, roleToPerspective(session.role));
    const present = Object.keys(room.presence || {}).length;
    updateStatus(present >= 2 ? 'リアルタイムPvP接続中' : '相手の再接続を待っています。');

    if (room.status === 'finished' && !session.finishedHandled) {
        session.finishedHandled = true;
        if (room.state?.outcome === 'boarding' || room.state?.outcome === 'boarded') {
            session.onBoarding?.(session.opponentId);
        }
    }
}

async function ensureRoom({ db, uid, selfId, selfName, opponentId, opponentName }) {
    const roomId = buildRoomId(selfId, opponentId);
    const roomRef = ref(db, `${ROOM_ROOT}/${roomId}`);
    let room = await readRoom(roomRef);
    if (isFinishedOrStale(room)) {
        room = createRoom({ roomId, uid, selfId, selfName, opponentId, opponentName });
    }

    const role = getRole(room, selfId);
    if (!role) {
        room = createRoom({ roomId, uid, selfId, selfName, opponentId, opponentName });
    } else if (!room.hostUid) {
        room.hostUid = uid;
    }

    const presence = { ...(room.presence || {}) };
    presence[uid] = {
        uid,
        role: getRole(room, selfId) || 'attacker',
        playFabId: normalizeId(selfId),
        displayName: String(selfName || selfId),
        updatedAt: serverTimestamp()
    };
    room.presence = presence;
    room.status = Object.keys(presence).length >= 2 ? 'active' : 'waiting';
    await writeRoom(roomRef, room);
    return { roomRef, roomId, room };
}

export async function startNavalPvpBattle({
    db,
    uid,
    selfId,
    selfName,
    opponentId,
    opponentName,
    onBoarding
} = {}) {
    if (!db || !uid) throw new Error('リアルタイム接続の準備ができていません。');
    if (!selfId || !opponentId) throw new Error('対戦相手が未設定です。');
    if (typeof window.startNavalBattle !== 'function') throw new Error('海戦の準備ができていません。');

    stopSession();

    const ensured = await ensureRoom({ db, uid, selfId, selfName, opponentId, opponentName });
    const role = getRole(ensured.room, selfId) || 'attacker';
    const opponentNameResolved = opponentNameFor(ensured.room, role, opponentName);

    window.startNavalBattle({
        opponentId,
        opponentName: opponentNameResolved,
        disableAi: true,
        disableTimer: true,
        onCommandSelect: sendCommand,
        onBoarding: () => onBoarding?.(opponentId)
    });
    ensureStatusElement();

    session = {
        db,
        uid,
        selfId: normalizeId(selfId),
        opponentId: normalizeId(opponentId),
        roomRef: ensured.roomRef,
        roomId: ensured.roomId,
        room: ensured.room,
        role,
        isHost: ensured.room.hostUid === uid,
        timer: null,
        unsub: null,
        presenceRef: ref(db, `${ROOM_ROOT}/${ensured.roomId}/presence/${uid}`),
        finishedHandled: false,
        onBoarding
    };

    try {
        const disc = onDisconnect(session.presenceRef);
        if (typeof disc.remove === 'function') await disc.remove();
    } catch (_) {
        // 接続解除処理は権限次第なので、失敗しても試合開始は止めない。
    }

    if (session.isHost && !ensured.room.state) {
        await publishLocalState();
    }

    session.unsub = onValue(ensured.roomRef, (snapshot) => {
        const room = snapshot.exists() ? snapshot.val() : null;
        if (!room) return;
        applyRoomState(room);
    });

    if (session.isHost) {
        session.timer = setInterval(() => {
            hostTick().catch((error) => {
                console.warn('[navalPvp] host tick failed:', error);
                updateStatus('同期処理に失敗しました。再接続してください。');
            });
        }, TICK_MS);
    }

    updateStatus(session.isHost ? 'PvPルームを作成しました。相手の参加待ちです。' : 'PvPルームに参加しました。');
    return { roomId: ensured.roomId, role };
}

export function stopNavalPvpBattle() {
    stopSession();
}

if (typeof window !== 'undefined') {
    window.startNavalPvpBattle = startNavalPvpBattle;
    window.stopNavalPvpBattle = stopNavalPvpBattle;
}

import {
    getEvents as requestEvents,
    createEvent as requestCreateEvent,
    joinEvent as requestJoinEvent,
    approveEvent as requestApproveEvent
} from './playfabClient.js';
import { createRequestId } from './api.js';
import { formatCurrencyLabel } from './config.js';

const EVENT_TYPE_LABELS = {
    darts: 'ダーツ',
    billiards: 'ビリヤード',
    karaoke: 'カラオケ',
    tabletennis: '卓球',
    poker: 'ポーカー',
    other: 'その他'
};

let cachedHostFee = 1000;
let cachedIsKing = false;
const GOLD_LABEL = formatCurrencyLabel('PS');
const DEFAULT_SPONSOR_NOTE = '王国協賛あり';

function formatGold(amount) {
    return `${Number(amount || 0).toLocaleString('ja-JP')}${GOLD_LABEL}`;
}

function formatDateTime(ms) {
    const value = Number(ms || 0);
    if (!value) return '-';
    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function toLocalDateTimeValue(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getEventTypeLabel(event) {
    return event?.typeLabel || EVENT_TYPE_LABELS[event?.type] || 'イベント';
}

function setMessage(text, isError = false) {
    const el = document.getElementById('eventPageMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
}

function setDefaultDateTime() {
    const input = document.getElementById('eventStartsAt');
    if (!input || input.value) return;
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setMinutes(0, 0, 0);
    input.value = toLocalDateTimeValue(date);
}

function renderEventCreateMeta() {
    const hostFeeEl = document.getElementById('eventHostFeeInfo');
    if (hostFeeEl) {
        hostFeeEl.textContent = cachedIsKing
            ? '王側の公式イベントは主催費なしで即公開されます。王国協賛は常に付きます。'
            : `主催費 ${cachedHostFee}${GOLD_LABEL}。承認後、イベント一覧と全体チャットに告知されます。王国協賛は常に付きます。`;
    }
}

function eventStatusLabel(status) {
    if (status === 'approved') return '公開中';
    if (status === 'pending') return '承認待ち';
    if (status === 'rejected') return '却下';
    return status || '-';
}

function renderEventCard(event, playFabId) {
    const card = document.createElement('article');
    card.className = `event-card is-${event.status || 'unknown'}`;
    const feeText = Number(event.entryFee || 0) > 0 ? formatGold(event.entryFee) : '無料';
    const prizeText = Number(event.prize || 0) > 0 ? formatGold(event.prize) : 'なし';
    const collectedText = formatGold(event.collectedEntryFeePs);
    const status = eventStatusLabel(event.status);
    const participants = Array.isArray(event.participants) ? event.participants : [];
    const participantNames = participants.length
        ? participants.map((entry) => entry.displayName || entry.playFabId).join(' / ')
        : '参加者なし';
    const hostName = event.hostDisplayName || event.hostPlayFabId || '-';
    const description = event.description || '説明はありません。';
    const sponsorNote = event.sponsorNote || DEFAULT_SPONSOR_NOTE;

    card.innerHTML = `
        <div class="event-card-head">
            <div>
                <div class="event-card-type">${escapeHtml(getEventTypeLabel(event))}</div>
                <h3>${escapeHtml(event.title || 'イベント')}</h3>
            </div>
            <span class="event-status">${escapeHtml(status)}</span>
        </div>
        <div class="event-card-time">${escapeHtml(formatDateTime(event.startsAtMs))}</div>
        <div class="event-card-meta">
            <span>主催 ${escapeHtml(hostName)}</span>
            <span>参加費 ${escapeHtml(feeText)}</span>
            <span>賞品 ${escapeHtml(prizeText)}</span>
            <span>集金 ${escapeHtml(collectedText)}</span>
            <span>${event.participantCount || 0}/${event.capacity || 0}</span>
        </div>
        <div class="event-sponsor-note">${escapeHtml(sponsorNote)}</div>
        <p class="event-card-desc">${escapeHtml(description)}</p>
        <div class="event-card-participants">${escapeHtml(participantNames)}</div>
        <div class="event-card-actions"></div>
    `;

    const actions = card.querySelector('.event-card-actions');
    if (event.canJoin) {
        const joinBtn = document.createElement('button');
        joinBtn.type = 'button';
        joinBtn.className = 'event-action-btn is-join';
        joinBtn.textContent = Number(event.entryFee || 0) > 0 ? `${formatGold(event.entryFee)}で参加` : '参加する';
        joinBtn.addEventListener('click', async () => {
            await joinEvent(playFabId, event.id);
        });
        actions.appendChild(joinBtn);
    } else if (event.isParticipant) {
        const joined = document.createElement('span');
        joined.className = 'event-action-note';
        joined.textContent = '参加済み';
        actions.appendChild(joined);
    }
    if (event.canApprove) {
        const sponsorInput = document.createElement('input');
        sponsorInput.type = 'text';
        sponsorInput.className = 'event-sponsor-input';
        sponsorInput.maxLength = 120;
        sponsorInput.placeholder = DEFAULT_SPONSOR_NOTE;
        sponsorInput.value = event.sponsorNote || DEFAULT_SPONSOR_NOTE;
        actions.appendChild(sponsorInput);
        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'event-action-btn is-approve';
        approveBtn.textContent = '承認';
        approveBtn.addEventListener('click', async () => approveEvent(playFabId, event.id, true, sponsorInput.value));
        const rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'event-action-btn is-reject';
        rejectBtn.textContent = '却下';
        rejectBtn.addEventListener('click', async () => approveEvent(playFabId, event.id, false, sponsorInput.value));
        actions.append(approveBtn, rejectBtn);
    }
    if (!actions.childNodes.length) {
        actions.remove();
    }
    return card;
}

function renderEvents(data, playFabId) {
    cachedHostFee = Number(data?.hostFee || cachedHostFee || 0);
    cachedIsKing = !!data?.isKing;
    renderEventCreateMeta();

    const listEl = document.getElementById('eventList');
    const emptyEl = document.getElementById('eventListEmpty');
    if (!listEl || !emptyEl) return;
    const events = Array.isArray(data?.events) ? data.events : [];
    listEl.innerHTML = '';
    emptyEl.hidden = events.length > 0;
    events.forEach((event) => {
        listEl.appendChild(renderEventCard(event, playFabId));
    });
}

async function loadEvents(playFabId) {
    if (!playFabId) return;
    setDefaultDateTime();
    setMessage('');
    const data = await requestEvents(playFabId, { isSilent: true });
    if (data?.success) {
        renderEvents(data, playFabId);
    }
}

async function createEvent(playFabId) {
    const title = document.getElementById('eventTitle')?.value || '';
    const type = document.getElementById('eventType')?.value || 'other';
    const startsAt = document.getElementById('eventStartsAt')?.value || '';
    const capacity = document.getElementById('eventCapacity')?.value || 8;
    const entryFee = document.getElementById('eventEntryFee')?.value || 0;
    const prize = document.getElementById('eventPrize')?.value || 0;
    const description = document.getElementById('eventDescription')?.value || '';
    try {
        const data = await requestCreateEvent(playFabId, {
            title,
            type,
            startsAt,
            startsAtMs: Date.parse(startsAt),
            capacity,
            entryFee,
            prize,
            description,
            requestId: createRequestId('event-create')
        }, { throwOnError: true });
        if (data?.success) {
            setMessage(data.event?.status === 'approved' ? 'イベントを公開しました。' : 'イベントを作成しました。承認後に公開されます。');
            ['eventTitle', 'eventDescription'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await loadEvents(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || 'イベント作成に失敗しました。', true);
    }
}

async function joinEvent(playFabId, eventId) {
    try {
        const data = await requestJoinEvent(playFabId, eventId, {
            displayName: window.myPlayFabDisplayName || '',
            requestId: createRequestId('event-join')
        }, { throwOnError: true });
        if (data?.success) {
            setMessage('参加しました。');
            await loadEvents(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || '参加処理に失敗しました。', true);
    }
}

async function approveEvent(playFabId, eventId, approve, sponsorNote = DEFAULT_SPONSOR_NOTE) {
    try {
        const data = await requestApproveEvent(playFabId, eventId, approve, { sponsorNote }, { throwOnError: true });
        if (data?.success) {
            setMessage(approve ? 'イベントを承認し、全体チャットへ告知しました。' : 'イベントを却下しました。');
            await loadEvents(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || '承認処理に失敗しました。', true);
    }
}

let bound = false;

function bindEvents(playFabId) {
    if (bound) return;
    const createBtn = document.getElementById('btnCreateEvent');
    if (createBtn) {
        createBtn.addEventListener('click', () => createEvent(window.myPlayFabId || playFabId));
    }
    const reloadBtn = document.getElementById('btnReloadEvents');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => loadEvents(window.myPlayFabId || playFabId));
    }
    bound = true;
}

export async function loadEventPage(playFabId) {
    bindEvents(playFabId);
    await loadEvents(playFabId);
}

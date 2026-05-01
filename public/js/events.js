import {
    getEvents as requestEvents,
    createEvent as requestCreateEvent,
    joinEvent as requestJoinEvent,
    approveEvent as requestApproveEvent,
    getReservations as requestReservations,
    createReservation as requestCreateReservation,
    reviewReservation as requestReviewReservation,
    cancelReservation as requestCancelReservation
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
const RESERVATION_PURPOSE_LABELS = {
    visit: '通常来店',
    darts: 'ダーツ',
    billiards: 'ビリヤード',
    consultation: '相談',
    private: '貸切',
    other: 'その他'
};

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

function setDefaultReservationDateTime() {
    const input = document.getElementById('reservationStartsAt');
    if (!input || input.value) return;
    const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
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

function reservationStatusLabel(status) {
    if (status === 'approved') return '確定';
    if (status === 'pending') return '承認待ち';
    if (status === 'rejected') return '却下';
    if (status === 'cancelled') return 'キャンセル';
    return status || '-';
}

function getReservationPurposeLabel(reservation) {
    return reservation?.purposeLabel || RESERVATION_PURPOSE_LABELS[reservation?.purpose] || '予約';
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

function renderReservationCard(reservation, playFabId) {
    const card = document.createElement('article');
    card.className = `event-card is-${reservation.status || 'unknown'}`;
    const status = reservationStatusLabel(reservation.status);
    const name = reservation.displayName || (reservation.isOwner ? 'あなた' : '予約あり');
    const note = reservation.note || '';
    card.innerHTML = `
        <div class="event-card-head">
            <div>
                <div class="event-card-type">${escapeHtml(getReservationPurposeLabel(reservation))}</div>
                <h3>${escapeHtml(formatDateTime(reservation.startsAtMs))}</h3>
            </div>
            <span class="event-status">${escapeHtml(status)}</span>
        </div>
        <div class="event-card-meta">
            <span>${Number(reservation.partySize || 0)}名</span>
            <span>${escapeHtml(name)}</span>
        </div>
        ${note ? `<p class="event-card-desc">${escapeHtml(note)}</p>` : ''}
        <div class="event-card-actions"></div>
    `;
    const actions = card.querySelector('.event-card-actions');
    if (reservation.canReview) {
        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'event-action-btn is-approve';
        approveBtn.textContent = '承認';
        approveBtn.addEventListener('click', async () => reviewReservation(playFabId, reservation.id, true));
        const rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'event-action-btn is-reject';
        rejectBtn.textContent = '却下';
        rejectBtn.addEventListener('click', async () => reviewReservation(playFabId, reservation.id, false));
        actions.append(approveBtn, rejectBtn);
    }
    if (reservation.canCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'event-action-btn is-reject';
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.addEventListener('click', async () => cancelReservation(playFabId, reservation.id));
        actions.appendChild(cancelBtn);
    }
    if (!actions.childNodes.length) actions.remove();
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

function renderReservations(data, playFabId) {
    const listEl = document.getElementById('reservationList');
    const emptyEl = document.getElementById('reservationListEmpty');
    if (!listEl || !emptyEl) return;
    const reservations = Array.isArray(data?.reservations) ? data.reservations : [];
    listEl.innerHTML = '';
    emptyEl.hidden = reservations.length > 0;
    reservations.forEach((reservation) => {
        listEl.appendChild(renderReservationCard(reservation, playFabId));
    });
}

async function loadEvents(playFabId) {
    if (!playFabId) return;
    setDefaultDateTime();
    setDefaultReservationDateTime();
    setMessage('');
    const [data, reservationData] = await Promise.all([
        requestEvents(playFabId, { isSilent: true }),
        requestReservations(playFabId, { isSilent: true })
    ]);
    if (data?.success) {
        renderEvents(data, playFabId);
    }
    if (reservationData?.success) {
        renderReservations(reservationData, playFabId);
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

async function createReservation(playFabId) {
    const startsAt = document.getElementById('reservationStartsAt')?.value || '';
    const partySize = document.getElementById('reservationPartySize')?.value || 1;
    const purpose = document.getElementById('reservationPurpose')?.value || 'visit';
    const note = document.getElementById('reservationNote')?.value || '';
    try {
        const data = await requestCreateReservation(playFabId, {
            startsAt,
            startsAtMs: Date.parse(startsAt),
            partySize,
            purpose,
            note,
            nation: window.myAvatarBaseInfo?.Nation || window.myAvatarBaseInfo?.nation || '',
            displayName: window.myPlayFabDisplayName || '',
            requestId: createRequestId('reservation-create')
        }, { throwOnError: true });
        if (data?.success) {
            setMessage('予約申請を送信しました。王の承認後に確定します。');
            const noteEl = document.getElementById('reservationNote');
            if (noteEl) noteEl.value = '';
            await loadEvents(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || '予約申請に失敗しました。', true);
    }
}

async function reviewReservation(playFabId, reservationId, approve) {
    try {
        const data = await requestReviewReservation(playFabId, reservationId, approve, { throwOnError: true });
        if (data?.success) {
            setMessage(approve ? '予約を承認しました。' : '予約を却下しました。');
            await loadEvents(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || '予約の承認処理に失敗しました。', true);
    }
}

async function cancelReservation(playFabId, reservationId) {
    try {
        const data = await requestCancelReservation(playFabId, reservationId, { throwOnError: true });
        if (data?.success) {
            setMessage('予約をキャンセルしました。');
            await loadEvents(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || '予約キャンセルに失敗しました。', true);
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
    const reservationBtn = document.getElementById('btnCreateReservation');
    if (reservationBtn) {
        reservationBtn.addEventListener('click', () => createReservation(window.myPlayFabId || playFabId));
    }
    const reservationPurpose = document.getElementById('reservationPurpose');
    const reservationPartySize = document.getElementById('reservationPartySize');
    const updateReservationHelp = () => {
        const help = document.getElementById('reservationPrivateHelp');
        if (!help) return;
        help.style.display = reservationPurpose?.value === 'private' ? '' : 'none';
        if (reservationPurpose?.value === 'private' && reservationPartySize && Number(reservationPartySize.value || 0) < 10) {
            reservationPartySize.value = '10';
        }
    };
    if (reservationPurpose) reservationPurpose.addEventListener('change', updateReservationHelp);
    updateReservationHelp();
    bound = true;
}

export async function loadEventPage(playFabId) {
    bindEvents(playFabId);
    await loadEvents(playFabId);
}

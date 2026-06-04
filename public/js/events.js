import {
    getPlayerStats,
    getGuildInfo,
    createGuild as requestCreateGuild,
    joinGuild as requestJoinGuild,
    leaveGuild as requestLeaveGuild,
    getGuildMembers as requestGuildMembers
} from './playfabClient.js';
import { getNationLabel } from './nationLabels.js';
import { buildPlayerTriggerHtml } from './playerProfile.js';
import { CREW_ROLE_DEFS, getCrewRoleLabel } from './crewRoles.js';

const CAPTAIN_LEVEL = 21;
const CREW_FOUNDING_COST = 10000;

let bound = false;
let currentGuild = null;
let currentLevel = 1;
let currentRankName = '見習い';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function setMessage(text, isError = false) {
    const el = document.getElementById('eventPageMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
}

function getRankName(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return '海賊王';
    if (value >= 31) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
}

function normalizeLevel(stats) {
    return Math.max(1, Math.floor(Number(stats?.Level || window.myAvatarBaseInfo?.level || 1) || 1));
}

async function copyText(text) {
    if (!text) return false;
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
}

function updateRankSummary() {
    const summary = document.getElementById('crewRankSummary');
    if (!summary) return;
    const unlocked = currentLevel >= CAPTAIN_LEVEL;
    summary.textContent = `Lv.${currentLevel} ${currentRankName} / ${unlocked ? '勧誘可' : `Lv.${CAPTAIN_LEVEL}で開放`}`;
}

function getCaptainCrewName() {
    const visibleName = document.getElementById('globalPlayerName')?.textContent || '';
    const rawName = String(window.myPlayFabDisplayName || window.myAvatarBaseInfo?.displayName || visibleName || '船長').trim() || '船長';
    return `${rawName.replace(/海賊団$/u, '').slice(0, 25)}海賊団`;
}

function renderRoleOptions(availableRoles = null) {
    const select = document.getElementById('crewRoleSelect');
    if (!select) return;
    const availability = new Map(
        Array.isArray(availableRoles)
            ? availableRoles.map((role) => [String(role.id || '').trim(), role.available !== false])
            : []
    );
    select.innerHTML = CREW_ROLE_DEFS.map((role) => {
        const known = availability.has(role.id);
        const available = known ? availability.get(role.id) : true;
        return `<option value="${escapeHtml(role.id)}" ${available ? '' : 'disabled'}>${escapeHtml(role.label)}${available ? '' : '（使用中）'}</option>`;
    }).join('');
}

function renderOverview(guild) {
    const list = document.getElementById('crewOverviewList');
    const empty = document.getElementById('crewOverviewEmpty');
    if (!list || !empty) return;

    list.innerHTML = '';
    if (!guild) {
        empty.hidden = true;
        const locked = currentLevel < CAPTAIN_LEVEL;
        const card = document.createElement('article');
        card.className = `event-card ${locked ? 'is-pending' : 'is-approved'}`;
        card.innerHTML = `
            <div class="event-card-head">
                <div>
                    <div class="event-card-type">${locked ? '未開放' : '作成可能'}</div>
                    <h3>${locked ? '船長になると仲間を集められます' : '仲間を作成できます'}</h3>
                </div>
                <span class="event-status">${locked ? `Lv.${CAPTAIN_LEVEL}+` : 'OK'}</span>
            </div>
            <p class="event-card-desc">${locked
                ? `現在はLv.${currentLevel} ${escapeHtml(currentRankName)}です。階級が船長以上になると、他プレイヤーを勧誘できるようになります。`
                : '船長の名前で海賊団を設立すると、勧誘QRを使って他プレイヤーを招待できます。'}</p>
        `;
        list.appendChild(card);
        return;
    }

    empty.hidden = true;
    const guildName = getNationLabel(guild.name) || guild.name || '仲間';
    const card = document.createElement('article');
    card.className = 'event-card is-approved';
    card.innerHTML = `
        <div class="event-card-head">
            <div>
                <div class="event-card-type">所属中</div>
                <h3>${escapeHtml(guildName)}</h3>
            </div>
            <span class="event-status">${escapeHtml(guild.role || 'メンバー')}</span>
        </div>
        <div class="event-card-meta">
            <span>仲間 ${Number(guild.companionCount || 0)} / ${Number(guild.maxCompanions || 7)}人</span>
            <span>総員 ${Number(guild.memberCount || 0)} / ${Number(guild.maxMembers || 8)}人</span>
            <span>Lv.${Number(guild.level || 1)}</span>
            <span>資金 ${Number(guild.treasury || 0).toLocaleString('ja-JP')}</span>
        </div>
        <p class="event-card-desc">勧誘QRを共有すると、他プレイヤーがこの仲間に参加できます。</p>
    `;
    list.appendChild(card);
}

function renderMembers(members) {
    const list = document.getElementById('crewMembersList');
    const empty = document.getElementById('crewMembersEmpty');
    if (!list || !empty) return;

    list.innerHTML = '';
    const entries = Array.isArray(members) ? members : [];
    empty.hidden = entries.length > 0;
    entries.forEach((member) => {
        const playFabId = String(member.playFabId || '').trim();
        const displayName = member.displayName || playFabId || 'Unknown';
        const card = document.createElement('article');
        card.className = 'event-card';
        card.innerHTML = `
            <div class="event-card-head">
                <div>
                    <div class="event-card-type">${escapeHtml(member.crewRankTitle || member.crewRoleLabel || member.roleName || member.role || 'メンバー')}</div>
                    <h3>${buildPlayerTriggerHtml(playFabId, displayName, { className: 'player-link-inline' })}</h3>
                </div>
                <span class="event-status">${escapeHtml(member.crewRoleLabel || member.role || '仲間')}</span>
            </div>
            <div class="event-card-meta">
                <span>ID ${escapeHtml(playFabId || '-')}</span>
                ${member.level ? `<span>Lv.${Number(member.level || 1)}</span>` : ''}
            </div>
        `;
        list.appendChild(card);
    });
}

function generateInviteQr(guildId) {
    const value = guildId ? `guild:${guildId}` : '';
    const canvas = document.getElementById('crewInviteQrCanvas');
    const valueEl = document.getElementById('crewInviteValue');
    if (valueEl) valueEl.textContent = value;
    if (!canvas || !value || typeof QRious !== 'function') return;
    new QRious({
        element: canvas,
        value,
        size: 160
    });
}

function renderInvitePanel(guild) {
    const hostFeeEl = document.getElementById('eventHostFeeInfo');
    const createPreview = document.getElementById('crewCreatePreview');
    const createBtn = document.getElementById('btnCreateCrew');
    const invitePanel = document.getElementById('crewInvitePanel');
    const joinPanel = document.getElementById('crewJoinPanel');
    const isCaptain = currentLevel >= CAPTAIN_LEVEL;
    const hasGuild = !!guild?.guildId;

    if (hostFeeEl) {
        if (hasGuild) {
            hostFeeEl.textContent = isCaptain
                ? `勧誘QRを共有して他プレイヤーを最大${Number(guild.maxCompanions || 7)}名まで仲間にできます。`
                : '所属中の海賊団です。';
        } else {
            hostFeeEl.textContent = isCaptain
                ? `設立には${CREW_FOUNDING_COST.toLocaleString('ja-JP')}G必要です。設立後に勧誘QRが発行されます。`
                : `現在はLv.${currentLevel} ${currentRankName}です。船長以上で利用できます。`;
        }
    }

    if (createPreview) {
        createPreview.hidden = hasGuild;
        createPreview.textContent = `${getCaptainCrewName()} を設立します。`;
    }
    if (createBtn) {
        createBtn.disabled = !isCaptain || hasGuild;
        createBtn.hidden = hasGuild;
        createBtn.textContent = isCaptain ? `${CREW_FOUNDING_COST.toLocaleString('ja-JP')}Gで海賊団を設立` : `Lv.${CAPTAIN_LEVEL}で開放`;
    }
    if (invitePanel) {
        invitePanel.hidden = !hasGuild;
    }
    if (joinPanel) {
        joinPanel.hidden = hasGuild;
    }

    renderRoleOptions(guild?.availableRoles || null);
    generateInviteQr(guild?.guildId || '');
}

async function loadCompanionPage(playFabId) {
    if (!playFabId) return;
    setMessage('');

    const [statsData, guildData] = await Promise.all([
        getPlayerStats(playFabId, { isSilent: true }).catch(() => null),
        getGuildInfo(playFabId, null, { isSilent: true }).catch(() => null)
    ]);

    currentLevel = normalizeLevel(statsData?.stats);
    currentRankName = getRankName(currentLevel);
    currentGuild = guildData?.guild || null;

    let members = [];
    if (currentGuild?.guildId) {
        const memberData = await requestGuildMembers(playFabId, currentGuild.guildId, { isSilent: true }).catch(() => null);
        members = Array.isArray(memberData?.members) ? memberData.members : [];
    }

    updateRankSummary();
    renderOverview(currentGuild);
    renderMembers(members);
    renderInvitePanel(currentGuild);
}

async function createCrew(playFabId) {
    if (currentLevel < CAPTAIN_LEVEL) {
        setMessage('船長以上になると海賊団を設立できます。', true);
        return;
    }
    try {
        const data = await requestCreateGuild(playFabId, '', { throwOnError: true });
        if (data?.success) {
            setMessage(`${data.guildName || '海賊団'}を設立しました。勧誘QRを共有できます。`);
            await loadCompanionPage(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '海賊団の設立に失敗しました。', true);
    }
}

async function joinCrewFromScan(playFabId) {
    const lineClient = typeof liff !== 'undefined' ? liff : null;
    if (!lineClient?.isInClient?.()) {
        setMessage('QR読み取りはLINEアプリ内で利用できます。', true);
        return;
    }
    try {
        const result = await lineClient.scanCodeV2();
        const value = String(result?.value || '').trim();
        if (!value.startsWith('guild:')) {
            setMessage('仲間の勧誘QRではありません。', true);
            return;
        }
        const crewRoleId = String(document.getElementById('crewRoleSelect')?.value || '').trim();
        if (!crewRoleId) {
            setMessage('役職を選んでください。', true);
            return;
        }
        const guildId = value.slice(6).trim();
        const data = await requestJoinGuild(playFabId, guildId, { crewRoleId }, { throwOnError: true });
        if (data?.success) {
            setMessage(`${getCrewRoleLabel(crewRoleId) || '選択した役職'}として仲間に参加しました。`);
            await loadCompanionPage(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '仲間への参加に失敗しました。', true);
    }
}

async function leaveCrew(playFabId) {
    if (!currentGuild?.guildId) return;
    if (!confirm('仲間から脱退しますか？')) return;
    try {
        const data = await requestLeaveGuild(playFabId, { throwOnError: true });
        if (data?.success) {
            setMessage('仲間から脱退しました。');
            await loadCompanionPage(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '脱退に失敗しました。', true);
    }
}

function bindEvents(playFabId) {
    if (bound) return;
    document.getElementById('btnReloadEvents')?.addEventListener('click', () => loadCompanionPage(window.myPlayFabId || playFabId));
    document.getElementById('btnCreateCrew')?.addEventListener('click', () => createCrew(window.myPlayFabId || playFabId));
    document.getElementById('btnCopyCrewInvite')?.addEventListener('click', async () => {
        const value = document.getElementById('crewInviteValue')?.textContent || '';
        const copied = await copyText(value).catch(() => false);
        setMessage(copied ? '勧誘コードをコピーしました。' : 'コピーに失敗しました。', !copied);
    });
    document.getElementById('btnScanJoinCrew')?.addEventListener('click', () => joinCrewFromScan(window.myPlayFabId || playFabId));
    document.getElementById('btnLeaveCrew')?.addEventListener('click', () => leaveCrew(window.myPlayFabId || playFabId));
    bound = true;
}

export async function loadEventPage(playFabId) {
    bindEvents(playFabId);
    await loadCompanionPage(playFabId);
}

import {
    getPlayerStats,
    getGuildInfo,
    getGuildInviteInfo,
    createGuild as requestCreateGuild,
    joinGuild as requestJoinGuild,
    leaveGuild as requestLeaveGuild,
    getGuildMembers as requestGuildMembers,
    getGuildApplications,
    approveGuildApplication,
    rejectGuildApplication,
    getCrewRecruitmentBoard,
    saveCrewRecruitment,
    applyCrewRecruitment
} from './playfabClient.js';
import { getNationLabel } from './nationLabels.js';
import { buildPlayerTriggerHtml } from './playerProfile.js';
import {
    CREW_ROLE_DEFS,
    CREW_ROLE_BY_ID,
    getCrewRankDecorationClass,
    getCrewRankLevel,
    getCrewRoleLabel
} from './crewRoles.js';

const CAPTAIN_LEVEL = 21;
const CREW_FOUNDING_COST = 1000;

let bound = false;
let currentGuild = null;
let currentLevel = 1;
let currentRankName = '見習い';
let currentIsKing = false;
let currentNationKey = '';
let currentRecruitmentPosts = [];
let currentApplications = [];
let selectedRecruitmentRoleIds = new Set();
let selectedInviteRoleId = '';
let pendingCrewInvite = null;

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

function parseBooleanFlag(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function normalizeNationKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const aliases = {
        human: 'fire',
        goblin: 'water',
        orc: 'earth',
        elf: 'wind'
    };
    const key = aliases[raw] || raw;
    const match = /^nation_([a-z]+)_island$/.exec(key);
    const resolved = match ? match[1] : key;
    return getNationLabel(resolved) ? resolved : '';
}

function getNationGuildName() {
    return `${getNationLabel(currentNationKey) || '国'}ギルド`;
}

function getRankName(level, isKing = false) {
    if (isKing) return '王';
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

function applyGuildNationSync(data) {
    const nation = String(data?.nation || '').trim().toLowerCase();
    const avatarColor = String(data?.avatarColor || '').trim().toLowerCase();
    if (!nation && !avatarColor) return;
    window.myAvatarBaseInfo = {
        ...(window.myAvatarBaseInfo || {}),
        ...(nation ? { Nation: nation } : {}),
        ...(avatarColor ? { AvatarColor: avatarColor } : {})
    };
}

function canRecruitCompanions() {
    return currentIsKing || currentLevel >= CAPTAIN_LEVEL;
}

function resolveNationKey(statsData, guild) {
    const candidates = [
        statsData?.nation,
        statsData?.stats?.Nation,
        window.myAvatarBaseInfo?.Nation,
        window.myAvatarBaseInfo?.nation,
        guild?.nation
    ];
    for (const candidate of candidates) {
        const key = normalizeNationKey(candidate);
        if (key) return key;
    }
    return '';
}

function resolveKingFlag(statsData, guild) {
    return parseBooleanFlag(statsData?.isKing)
        || parseBooleanFlag(statsData?.stats?.IsKing)
        || parseBooleanFlag(window.myAvatarBaseInfo?.isKing)
        || (!!guild?.isNationGuild && !!guild?.isOwner);
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
    const unlocked = canRecruitCompanions();
    const unlockLabel = currentIsKing ? '国ギルド勧誘可' : (unlocked ? '勧誘可' : `Lv.${CAPTAIN_LEVEL}で開放`);
    summary.textContent = `Lv.${currentLevel} ${currentRankName} / ${unlockLabel}`;
}

function getCaptainCrewName() {
    if (currentIsKing) return getNationGuildName();
    const visibleName = document.getElementById('globalPlayerName')?.textContent || '';
    const rawName = String(window.myPlayFabDisplayName || window.myAvatarBaseInfo?.displayName || visibleName || '船長').trim() || '船長';
    return `${rawName.replace(/海賊団$/u, '').slice(0, 25)}海賊団`;
}

function getCrewNameInputValue() {
    return String(document.getElementById('crewNameInput')?.value || '').replace(/\s+/g, ' ').trim();
}

function getCrewCreateName() {
    if (currentIsKing) return getNationGuildName();
    return getCrewNameInputValue() || getCaptainCrewName();
}

function updateCrewCreatePreview() {
    const createPreview = document.getElementById('crewCreatePreview');
    const hint = document.getElementById('crewNameHint');
    if (createPreview) {
        createPreview.textContent = `${getCrewCreateName()} を設立します。`;
    }
    if (hint && !currentIsKing) {
        const fallbackName = getCaptainCrewName();
        const inputName = getCrewNameInputValue();
        hint.textContent = inputName
            ? `${inputName} として作成します。`
            : `未入力なら「${fallbackName}」で作成します。`;
    }
}

function buildRoleAvailabilityMap(availableRoles = null) {
    return new Map(
        Array.isArray(availableRoles)
            ? availableRoles.map((role) => [String(role.id || '').trim(), role.available !== false])
            : []
    );
}

function isRoleAvailable(availability, roleId) {
    return availability.has(roleId) ? availability.get(roleId) : true;
}

function renderInviteRoleOptions(availableRoles = null) {
    const select = document.getElementById('crewInviteRoleSelect');
    if (!select) return;
    const availability = buildRoleAvailabilityMap(availableRoles);
    const firstAvailable = CREW_ROLE_DEFS.find((role) => isRoleAvailable(availability, role.id))?.id || '';
    if (!selectedInviteRoleId || !isRoleAvailable(availability, selectedInviteRoleId)) {
        selectedInviteRoleId = firstAvailable;
    }
    select.innerHTML = CREW_ROLE_DEFS.map((role) => {
        const available = isRoleAvailable(availability, role.id);
        return `<option value="${escapeHtml(role.id)}" ${available ? '' : 'disabled'}>${escapeHtml(role.label)} / ${escapeHtml(role.gameLabel)}${available ? '' : '（使用中）'}</option>`;
    }).join('');
    select.value = selectedInviteRoleId;
    select.disabled = !selectedInviteRoleId;
    select.onchange = () => {
        selectedInviteRoleId = String(select.value || '').trim();
        renderInviteRoleGuide(availability);
        generateInviteQr(currentGuild?.guildId || '', selectedInviteRoleId);
    };
    renderInviteRoleGuide(availability);
}

function renderInviteRoleGuide(availability = new Map()) {
    const guide = document.getElementById('crewInviteRoleGuide');
    const select = document.getElementById('crewInviteRoleSelect');
    if (!guide || !select) return;

    const selectedRoleId = String(select.value || '').trim();
    guide.innerHTML = CREW_ROLE_DEFS.map((role) => {
        const available = isRoleAvailable(availability, role.id);
        const selected = selectedRoleId === role.id;
        const sampleRankLevel = 3;
        return `
            <button
                type="button"
                class="crew-role-card ${selected ? 'is-selected' : ''} ${available ? '' : 'is-disabled'} crew-rank-${sampleRankLevel}"
                data-crew-role-id="${escapeHtml(role.id)}"
                data-crew-icon="${escapeHtml(role.iconKey)}"
                ${available ? '' : 'disabled'}
            >
                <span class="crew-role-icon" aria-hidden="true"></span>
                <span class="crew-role-copy">
                    <strong>${escapeHtml(role.label)}</strong>
                    <span>${escapeHtml(role.gameLabel)}</span>
                </span>
            </button>
        `;
    }).join('');

    guide.querySelectorAll('[data-crew-role-id]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.disabled) return;
            select.value = button.dataset.crewRoleId || '';
            selectedInviteRoleId = String(select.value || '').trim();
            renderInviteRoleGuide(availability);
            generateInviteQr(currentGuild?.guildId || '', selectedInviteRoleId);
        });
    });
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getAvailableRoleMap(availableRoles = []) {
    return new Map(
        Array.isArray(availableRoles)
            ? availableRoles.map((role) => [String(role.id || '').trim(), role.available !== false])
            : []
    );
}

function renderRecruitmentRoleGuide(guild) {
    const guide = document.getElementById('crewRecruitmentRoleGuide');
    if (!guide) return;
    const availability = getAvailableRoleMap(guild?.availableRoles || []);
    guide.innerHTML = CREW_ROLE_DEFS.map((role) => {
        const known = availability.has(role.id);
        const available = known ? availability.get(role.id) : true;
        const selected = selectedRecruitmentRoleIds.has(role.id);
        return `
            <button
                type="button"
                class="crew-role-card ${selected ? 'is-selected' : ''} ${available ? '' : 'is-disabled'} crew-rank-3"
                data-recruitment-role-id="${escapeHtml(role.id)}"
                data-crew-icon="${escapeHtml(role.iconKey)}"
                aria-pressed="${selected ? 'true' : 'false'}"
                ${available ? '' : 'disabled'}
            >
                <span class="crew-role-icon" aria-hidden="true"></span>
                <span class="crew-role-copy">
                    <strong>${escapeHtml(role.label)}</strong>
                    <span>${escapeHtml(role.gameLabel)}${available ? '' : ' / 使用中'}</span>
                </span>
            </button>
        `;
    }).join('');

    guide.querySelectorAll('[data-recruitment-role-id]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.disabled) return;
            const roleId = button.dataset.recruitmentRoleId || '';
            if (selectedRecruitmentRoleIds.has(roleId)) {
                selectedRecruitmentRoleIds.delete(roleId);
            } else {
                selectedRecruitmentRoleIds.add(roleId);
            }
            renderRecruitmentRoleGuide(guild);
        });
    });
}

function renderRecruitmentManager(guild) {
    const panel = document.getElementById('crewRecruitmentManagePanel');
    const note = document.getElementById('crewRecruitmentManageNote');
    const messageInput = document.getElementById('crewRecruitmentMessage');
    const saveBtn = document.getElementById('btnSaveCrewRecruitment');
    const closeBtn = document.getElementById('btnCloseCrewRecruitment');
    const isOwner = !!guild?.guildId && (guild.isOwner || guild.role === '船長');
    if (panel) panel.hidden = !isOwner;
    if (!isOwner) return;

    const recruitment = guild.recruitment || {};
    selectedRecruitmentRoleIds = new Set(Array.isArray(recruitment.roleIds) ? recruitment.roleIds : []);
    if (messageInput) messageInput.value = recruitment.message || '';
    if (note) {
        const openCount = selectedRecruitmentRoleIds.size;
        note.textContent = recruitment.isOpen
            ? `現在 ${openCount} 役職を募集中です。`
            : '募集する役職を選んで公開できます。';
    }
    if (saveBtn) saveBtn.disabled = false;
    if (closeBtn) closeBtn.disabled = !recruitment.isOpen;
    renderRecruitmentRoleGuide(guild);
}

function renderApplications(applications, guild) {
    const panel = document.getElementById('crewApplicationsPanel');
    const list = document.getElementById('crewApplicationsList');
    const empty = document.getElementById('crewApplicationsEmpty');
    const summary = document.getElementById('crewApplicationsSummary');
    const isOwner = !!guild?.guildId && (guild.isOwner || guild.role === '船長');
    if (panel) panel.hidden = !isOwner;
    if (!isOwner || !list || !empty) return;

    const entries = Array.isArray(applications) ? applications : [];
    list.innerHTML = '';
    empty.hidden = entries.length > 0;
    if (summary) summary.textContent = `${entries.length}件`;
    const availability = getAvailableRoleMap(guild?.availableRoles || []);

    entries.forEach((app) => {
        const playFabId = String(app.playFabId || '').trim();
        const roleId = String(app.crewRoleId || '').trim();
        const roleDef = CREW_ROLE_BY_ID[roleId] || null;
        const availableOptions = CREW_ROLE_DEFS.map((role) => {
            const available = availability.has(role.id) ? availability.get(role.id) : true;
            const selected = role.id === roleId;
            const disabled = !available && !selected;
            return `<option value="${escapeHtml(role.id)}" ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(role.label)}${available || selected ? '' : '（使用中）'}</option>`;
        }).join('');
        const card = document.createElement('article');
        card.className = 'event-card is-pending crew-application-card';
        if (roleDef?.iconKey) card.dataset.crewIcon = roleDef.iconKey;
        card.innerHTML = `
            <div class="event-card-head">
                <span class="crew-role-icon" aria-hidden="true"></span>
                <div>
                    <div class="event-card-type">加入申請</div>
                    <h3>${buildPlayerTriggerHtml(playFabId, app.displayName || playFabId || 'Unknown', { className: 'player-link-inline' })}</h3>
                </div>
                <span class="event-status">${escapeHtml(app.crewRoleLabel || roleDef?.label || '役職未選択')}</span>
            </div>
            <div class="event-card-meta">
                ${roleDef?.gameLabel ? `<span>${escapeHtml(roleDef.gameLabel)}</span>` : ''}
                ${app.appliedAt ? `<span>${escapeHtml(formatDateTime(app.appliedAt))}</span>` : ''}
            </div>
            <div class="crew-application-role-row">
                <label>承認役職<select data-application-role>${availableOptions}</select></label>
            </div>
            <div class="event-card-actions">
                <button class="event-action-btn is-approve js-approve-crew-application" type="button" data-applicant-id="${escapeHtml(playFabId)}">承認</button>
                <button class="event-action-btn is-reject js-reject-crew-application" type="button" data-applicant-id="${escapeHtml(playFabId)}">拒否</button>
            </div>
        `;
        list.appendChild(card);
    });
}

function renderRecruitmentBoard(posts, guild) {
    const list = document.getElementById('crewRecruitmentBoardList');
    const empty = document.getElementById('crewRecruitmentBoardEmpty');
    const summary = document.getElementById('crewRecruitmentBoardSummary');
    if (!list || !empty) return;

    const entries = Array.isArray(posts) ? posts : [];
    list.innerHTML = '';
    empty.hidden = entries.length > 0;
    if (summary) summary.textContent = `${entries.length}件`;

    entries.forEach((post) => {
        const isNationGuild = post.guildType === 'nation' || !!post.isNationGuild;
        const guildKindLabel = isNationGuild ? '国ギルド' : '海賊団';
        const ownerTitle = post.ownerTitle || (isNationGuild ? '王' : '船長');
        const guildName = post.guildName || (isNationGuild ? `${getNationLabel(post.nation) || '国'}ギルド` : '海賊団');
        const roleOptions = (Array.isArray(post.roles) ? post.roles : [])
            .map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.label)} / ${escapeHtml(role.gameLabel || '')}</option>`)
            .join('');
        const status = guild?.guildId
            ? '所属中'
            : post.hasApplied
                ? '申請済み'
                : post.canApply
                    ? '募集中'
                    : '申請不可';
        const card = document.createElement('article');
        card.className = `event-card ${post.hasApplied ? 'is-pending' : 'is-approved'}`;
        card.innerHTML = `
            <div class="event-card-head">
                <div>
                    <div class="event-card-type">${escapeHtml(guildKindLabel)}勧誘</div>
                    <h3>${escapeHtml(guildName)}</h3>
                </div>
                <span class="event-status">${escapeHtml(status)}</span>
            </div>
            <div class="event-card-meta">
                ${post.captainName ? `<span>${escapeHtml(ownerTitle)} ${escapeHtml(post.captainName)}</span>` : ''}
                <span>仲間 ${Number(post.companionCount || 0)} / ${Number(post.maxCompanions || 7)}人</span>
                ${post.updatedAt ? `<span>${escapeHtml(formatDateTime(post.updatedAt))}</span>` : ''}
            </div>
            ${post.message ? `<p class="event-card-desc">${escapeHtml(post.message)}</p>` : ''}
            <div class="event-card-meta">
                ${(post.roles || []).map((role) => `<span>${escapeHtml(role.label)}</span>`).join('')}
            </div>
            <div class="event-card-actions">
                <select class="crew-recruitment-role-select" data-board-role ${post.canApply ? '' : 'disabled'}>${roleOptions}</select>
                <button class="event-action-btn is-join js-apply-crew-recruitment" type="button" data-guild-id="${escapeHtml(post.guildId)}" ${post.canApply ? '' : 'disabled'}>加入申請</button>
            </div>
        `;
        list.appendChild(card);
    });
}

function renderOverview(guild) {
    const list = document.getElementById('crewOverviewList');
    const empty = document.getElementById('crewOverviewEmpty');
    if (!list || !empty) return;

    list.innerHTML = '';
    if (!guild) {
        empty.hidden = true;
        const locked = !canRecruitCompanions();
        const title = locked
            ? '船長になると仲間を集められます'
            : currentIsKing
                ? '国のギルドを設立できます'
                : '仲間を作成できます';
        const status = locked ? `Lv.${CAPTAIN_LEVEL}+` : (currentIsKing ? '王' : 'OK');
        const typeLabel = locked ? '未開放' : (currentIsKing ? '王権限' : '作成可能');
        const desc = locked
            ? `現在はLv.${currentLevel} ${currentRankName}です。階級が船長以上になると、他プレイヤーを勧誘できるようになります。`
            : currentIsKing
                ? `王はレベルに関係なく、${getNationGuildName()}で他プレイヤーを勧誘できます。`
                : '船長の名前で海賊団を設立すると、勧誘QRを使って他プレイヤーを招待できます。';
        const card = document.createElement('article');
        card.className = `event-card ${locked ? 'is-pending' : 'is-approved'}`;
        card.innerHTML = `
            <div class="event-card-head">
                <div>
                    <div class="event-card-type">${escapeHtml(typeLabel)}</div>
                    <h3>${escapeHtml(title)}</h3>
                </div>
                <span class="event-status">${escapeHtml(status)}</span>
            </div>
            <p class="event-card-desc">${escapeHtml(desc)}</p>
        `;
        list.appendChild(card);
        return;
    }

    empty.hidden = true;
    const isNationGuild = guild.guildType === 'nation' || !!guild.isNationGuild;
    const guildKindLabel = isNationGuild ? '国ギルド' : '海賊団';
    const guildName = getNationLabel(guild.name) || guild.name || '仲間';
    const desc = isNationGuild
        ? '王の国ギルドです。勧誘QRを共有すると、他プレイヤーがこの仲間に参加できます。'
        : '勧誘QRを共有すると、他プレイヤーがこの仲間に参加できます。';
    const card = document.createElement('article');
    card.className = 'event-card is-approved';
    card.innerHTML = `
        <div class="event-card-head">
            <div>
                <div class="event-card-type">所属中 / ${escapeHtml(guildKindLabel)}</div>
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
        <p class="event-card-desc">${escapeHtml(desc)}</p>
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
        const roleId = String(member.crewRoleId || '').trim();
        const roleDef = CREW_ROLE_BY_ID[roleId] || null;
        const memberLevel = Number(member.level || 1) || 1;
        const rankLevel = Number(member.crewRankLevel || getCrewRankLevel(memberLevel)) || 1;
        const rankClass = member.crewRankDecorationClass || getCrewRankDecorationClass(memberLevel);
        const iconKey = member.crewIconKey || roleDef?.iconKey || '';
        const gameLabel = member.crewGameLabel || roleDef?.gameLabel || '';
        const card = document.createElement('article');
        card.className = `event-card crew-member-card ${rankClass}`;
        if (iconKey) card.dataset.crewIcon = iconKey;
        card.innerHTML = `
            <div class="event-card-head">
                <span class="crew-role-icon" aria-hidden="true"></span>
                <div>
                    <div class="event-card-type">${escapeHtml(member.crewRankTitle || member.crewRoleLabel || member.roleName || member.role || 'メンバー')}</div>
                    <h3>${buildPlayerTriggerHtml(playFabId, displayName, { className: 'player-link-inline' })}</h3>
                </div>
                <span class="event-status">${escapeHtml(member.crewRoleLabel || member.role || '仲間')}</span>
            </div>
            <div class="event-card-meta">
                ${gameLabel ? `<span>${escapeHtml(gameLabel)}</span>` : ''}
                ${roleId ? `<span>役職Lv.${rankLevel}</span>` : ''}
                ${member.level ? `<span>Lv.${Number(member.level || 1)}</span>` : ''}
            </div>
        `;
        list.appendChild(card);
    });
}

function buildInviteQrValue(guildId, crewRoleId) {
    const safeGuildId = String(guildId || '').trim();
    const safeRoleId = String(crewRoleId || '').trim();
    return safeGuildId && safeRoleId ? `guild:${safeGuildId}:role:${safeRoleId}` : '';
}

function parseInviteQrValue(value) {
    const raw = String(value || '').trim();
    const parts = raw.split(':');
    if (parts[0] !== 'guild' || !parts[1]) return null;
    if (parts.length === 2) {
        return { guildId: parts[1].trim(), crewRoleId: '', isLegacy: true };
    }
    if (parts.length >= 4 && parts[2] === 'role') {
        return { guildId: parts[1].trim(), crewRoleId: String(parts[3] || '').trim(), isLegacy: false };
    }
    return null;
}

function clearInviteQrCanvas(canvas) {
    if (!canvas) return;
    const context = canvas.getContext?.('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width || 160, canvas.height || 160);
}

function generateInviteQr(guildId, crewRoleId) {
    const value = buildInviteQrValue(guildId, crewRoleId);
    const canvas = document.getElementById('crewInviteQrCanvas');
    const valueEl = document.getElementById('crewInviteValue');
    const copyBtn = document.getElementById('btnCopyCrewInvite');
    if (valueEl) valueEl.textContent = value || '空いている役職を選んでください。';
    if (copyBtn) copyBtn.disabled = !value;
    if (!canvas || !value || typeof QRious !== 'function') {
        clearInviteQrCanvas(canvas);
        return;
    }
    new QRious({
        element: canvas,
        value,
        size: 160
    });
}

function clearJoinConfirmation() {
    pendingCrewInvite = null;
    const panel = document.getElementById('crewJoinConfirmPanel');
    const body = document.getElementById('crewJoinConfirmBody');
    const confirmBtn = document.getElementById('btnConfirmCrewJoin');
    if (panel) panel.hidden = true;
    if (body) body.innerHTML = '';
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '加入する';
    }
}

function renderJoinConfirmation(invite) {
    pendingCrewInvite = invite || null;
    const panel = document.getElementById('crewJoinConfirmPanel');
    const body = document.getElementById('crewJoinConfirmBody');
    const confirmBtn = document.getElementById('btnConfirmCrewJoin');
    if (!panel || !body || !pendingCrewInvite) {
        clearJoinConfirmation();
        return;
    }

    const roleId = String(pendingCrewInvite.crewRoleId || '').trim();
    const roleDef = CREW_ROLE_BY_ID[roleId] || {};
    const roleLabel = pendingCrewInvite.crewRoleLabel || roleDef.label || getCrewRoleLabel(roleId) || '役職';
    const gameLabel = pendingCrewInvite.crewGameLabel || roleDef.gameLabel || '';
    const iconKey = pendingCrewInvite.crewIconKey || roleDef.iconKey || '';
    const canJoin = pendingCrewInvite.canJoin !== false;
    if (confirmBtn) confirmBtn.disabled = !canJoin;
    panel.hidden = false;
    body.innerHTML = `
        <article class="event-card crew-join-confirm-card ${canJoin ? '' : 'is-rejected'}" data-crew-icon="${escapeHtml(iconKey)}">
            <div class="event-card-head">
                <span class="crew-role-icon" aria-hidden="true"></span>
                <div>
                    <div class="event-card-type">${escapeHtml(pendingCrewInvite.ownerTitle || '船長')}からの勧誘</div>
                    <h3>${escapeHtml(pendingCrewInvite.guildName || 'ギルド')}</h3>
                </div>
                <span class="event-status">${canJoin ? '確認待ち' : '加入不可'}</span>
            </div>
            <div class="event-card-meta">
                <span>${escapeHtml(roleLabel)}</span>
                ${gameLabel ? `<span>${escapeHtml(gameLabel)}</span>` : ''}
                <span>仲間 ${Number(pendingCrewInvite.companionCount || 0)} / ${Number(pendingCrewInvite.maxCompanions || 7)}人</span>
            </div>
            <p class="event-card-desc">${escapeHtml(canJoin ? `${roleLabel}として加入しますか？` : (pendingCrewInvite.unavailableReason || 'この勧誘は現在利用できません。'))}</p>
        </article>
    `;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderInvitePanel(guild) {
    const hostFeeEl = document.getElementById('eventHostFeeInfo');
    const createOptions = document.getElementById('crewCreateOptions');
    const nameInput = document.getElementById('crewNameInput');
    const createPreview = document.getElementById('crewCreatePreview');
    const createBtn = document.getElementById('btnCreateCrew');
    const invitePanel = document.getElementById('crewInvitePanel');
    const joinPanel = document.getElementById('crewJoinPanel');
    const isCaptain = currentLevel >= CAPTAIN_LEVEL;
    const canCreateGuild = canRecruitCompanions();
    const hasGuild = !!guild?.guildId;
    const isNationGuild = guild?.guildType === 'nation' || !!guild?.isNationGuild;
    const guildKindLabel = isNationGuild ? '国ギルド' : '海賊団';
    const canInviteToGuild = hasGuild && (guild?.isOwner || currentIsKing || guild?.role === '船長' || guild?.role === '王');

    if (hostFeeEl) {
        if (hasGuild) {
            hostFeeEl.textContent = canCreateGuild || guild?.isOwner
                ? `勧誘QRを共有して他プレイヤーを最大${Number(guild.maxCompanions || 7)}名まで仲間にできます。`
                : `所属中の${guildKindLabel}です。`;
        } else {
            hostFeeEl.textContent = currentIsKing
                ? `王はレベルに関係なく国ギルドを設立できます。設立には${CREW_FOUNDING_COST.toLocaleString('ja-JP')}G必要です。`
                : isCaptain
                    ? `海賊団名は任意です。未入力なら自動命名し、設立後に勧誘QRが発行されます。`
                : `現在はLv.${currentLevel} ${currentRankName}です。船長以上で利用できます。`;
        }
    }

    if (createOptions) {
        createOptions.hidden = hasGuild || currentIsKing || !isCaptain;
    }
    if (nameInput) {
        nameInput.disabled = hasGuild || currentIsKing || !isCaptain;
        nameInput.placeholder = `${getCaptainCrewName()}（未入力時）`;
    }
    if (createPreview) {
        createPreview.hidden = hasGuild;
    }
    if (createBtn) {
        createBtn.disabled = !canCreateGuild || hasGuild;
        createBtn.hidden = hasGuild;
        createBtn.textContent = currentIsKing
            ? `${CREW_FOUNDING_COST.toLocaleString('ja-JP')}Gで国ギルドを設立`
            : isCaptain
                ? `${CREW_FOUNDING_COST.toLocaleString('ja-JP')}Gで海賊団を設立`
                : `Lv.${CAPTAIN_LEVEL}で開放`;
    }
    if (invitePanel) {
        invitePanel.hidden = !hasGuild;
    }
    const inviteOwnerControls = document.getElementById('crewInviteOwnerControls');
    if (inviteOwnerControls) {
        inviteOwnerControls.hidden = !canInviteToGuild;
    }
    const inviteMemberNote = document.getElementById('crewInviteMemberNote');
    if (inviteMemberNote) {
        inviteMemberNote.hidden = canInviteToGuild;
    }
    if (joinPanel) {
        joinPanel.hidden = hasGuild;
    }
    if (hasGuild) {
        clearJoinConfirmation();
    }

    renderInviteRoleOptions(canInviteToGuild ? guild?.availableRoles || null : null);
    generateInviteQr(canInviteToGuild ? guild?.guildId || '' : '', canInviteToGuild ? selectedInviteRoleId : '');
    updateCrewCreatePreview();
}

async function loadCompanionPage(playFabId) {
    if (!playFabId) return;
    setMessage('');

    const [statsData, guildData, boardData] = await Promise.all([
        getPlayerStats(playFabId, { isSilent: true }).catch(() => null),
        getGuildInfo(playFabId, null, { isSilent: true }).catch(() => null),
        getCrewRecruitmentBoard(playFabId, { isSilent: true }).catch(() => null)
    ]);

    currentGuild = guildData?.guild || null;
    currentNationKey = resolveNationKey(statsData, currentGuild);
    currentIsKing = resolveKingFlag(statsData, currentGuild);
    currentLevel = normalizeLevel(statsData?.stats);
    currentRankName = getRankName(currentLevel, currentIsKing);
    currentRecruitmentPosts = Array.isArray(boardData?.posts) ? boardData.posts : [];

    let members = [];
    if (currentGuild?.guildId) {
        const memberData = await requestGuildMembers(playFabId, currentGuild.guildId, { isSilent: true }).catch(() => null);
        members = Array.isArray(memberData?.members) ? memberData.members : [];
    }
    currentApplications = [];
    if (currentGuild?.guildId && (currentGuild.isOwner || currentGuild.role === '船長')) {
        const applicationsData = await getGuildApplications(playFabId, currentGuild.guildId, { isSilent: true }).catch(() => null);
        currentApplications = Array.isArray(applicationsData?.applications) ? applicationsData.applications : [];
    }

    updateRankSummary();
    renderOverview(currentGuild);
    renderMembers(members);
    renderInvitePanel(currentGuild);
    renderRecruitmentManager(currentGuild);
    renderApplications(currentApplications, currentGuild);
    renderRecruitmentBoard(currentRecruitmentPosts, currentGuild);
}

async function createCrew(playFabId) {
    if (!canRecruitCompanions()) {
        setMessage('船長以上、または王になるとギルドを設立できます。', true);
        return;
    }
    const createBtn = document.getElementById('btnCreateCrew');
    const requestedName = currentIsKing ? '' : getCrewNameInputValue();
    if (requestedName.length > 30) {
        setMessage('海賊団名は30文字以内で入力してください。', true);
        return;
    }
    const previousText = createBtn?.textContent || '';
    try {
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.textContent = '設立中...';
        }
        setMessage(`${getCrewCreateName()}を設立しています...`);
        const data = await requestCreateGuild(playFabId, requestedName, { throwOnError: true });
        if (data?.success) {
            const fallbackName = data?.isNationGuild ? '国ギルド' : '海賊団';
            await loadCompanionPage(playFabId);
            setMessage(`${data.guildName || fallbackName}を設立しました。勧誘QRを共有できます。`);
            document.getElementById('crewInvitePanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            setMessage(data?.error || 'ギルドの設立に失敗しました。', true);
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.textContent = previousText;
            }
        }
    } catch (error) {
        setMessage(error?.message || error?.error || 'ギルドの設立に失敗しました。', true);
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = previousText;
        }
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
        const inviteCode = parseInviteQrValue(value);
        if (!inviteCode?.guildId) {
            setMessage('仲間の勧誘QRではありません。', true);
            return;
        }
        if (inviteCode.isLegacy || !inviteCode.crewRoleId) {
            setMessage('役職が指定されていない古い勧誘QRです。船長に新しい役職QRを表示してもらってください。', true);
            return;
        }
        const data = await getGuildInviteInfo(playFabId, inviteCode.guildId, inviteCode.crewRoleId, { throwOnError: true });
        if (data?.success && data.invite) {
            renderJoinConfirmation(data.invite);
            const roleLabel = data.invite.crewRoleLabel || getCrewRoleLabel(inviteCode.crewRoleId) || '役職';
            setMessage(`${roleLabel}として加入する内容を確認してください。`);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '勧誘内容の確認に失敗しました。', true);
    }
}

async function confirmCrewJoin(playFabId) {
    if (!pendingCrewInvite?.guildId || !pendingCrewInvite?.crewRoleId) {
        setMessage('確認中の勧誘がありません。', true);
        return;
    }
    const confirmBtn = document.getElementById('btnConfirmCrewJoin');
    const previousText = confirmBtn?.textContent || '';
    try {
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '加入中...';
        }
        const guildId = pendingCrewInvite.guildId;
        const crewRoleId = pendingCrewInvite.crewRoleId;
        const data = await requestJoinGuild(playFabId, guildId, { crewRoleId }, { throwOnError: true });
        if (data?.success) {
            applyGuildNationSync(data);
            clearJoinConfirmation();
            await loadCompanionPage(playFabId);
            setMessage(`${getCrewRoleLabel(crewRoleId) || '選択した役職'}として仲間に参加しました。`);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '仲間への参加に失敗しました。', true);
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = previousText;
        }
    }
}

function cancelCrewJoin() {
    clearJoinConfirmation();
    setMessage('加入を見送りました。');
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

async function saveRecruitment(playFabId, isOpen = true) {
    if (!currentGuild?.guildId) return;
    const roleIds = Array.from(selectedRecruitmentRoleIds);
    if (isOpen && roleIds.length === 0) {
        setMessage('募集する役職を選んでください。', true);
        return;
    }
    try {
        const message = document.getElementById('crewRecruitmentMessage')?.value || '';
        const data = await saveCrewRecruitment(playFabId, currentGuild.guildId, {
            isOpen,
            roleIds: isOpen ? roleIds : [],
            message
        }, { throwOnError: true });
        if (data?.success) {
            setMessage(isOpen ? '募集を掲示板に公開しました。' : '募集を停止しました。');
            await loadCompanionPage(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '募集内容の保存に失敗しました。', true);
    }
}

async function applyToRecruitment(playFabId, button) {
    const guildId = String(button?.dataset?.guildId || '').trim();
    const card = button?.closest?.('.event-card');
    const crewRoleId = String(card?.querySelector?.('[data-board-role]')?.value || '').trim();
    if (!guildId || !crewRoleId) {
        setMessage('申請するギルドと役職を選んでください。', true);
        return;
    }
    try {
        const data = await applyCrewRecruitment(playFabId, guildId, crewRoleId, { throwOnError: true });
        if (data?.success) {
            setMessage(`${getCrewRoleLabel(crewRoleId) || '選択した役職'}で加入申請を送りました。`);
            await loadCompanionPage(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '加入申請の送信に失敗しました。', true);
    }
}

async function approveApplication(playFabId, button) {
    if (!currentGuild?.guildId) return;
    const applicantId = String(button?.dataset?.applicantId || '').trim();
    const card = button?.closest?.('.event-card');
    const crewRoleId = String(card?.querySelector?.('[data-application-role]')?.value || '').trim();
    if (!applicantId || !crewRoleId) {
        setMessage('承認する申請と役職を選んでください。', true);
        return;
    }
    try {
        const data = await approveGuildApplication(playFabId, currentGuild.guildId, applicantId, { crewRoleId }, { throwOnError: true });
        if (data?.success) {
            applyGuildNationSync(data);
            setMessage(`${getCrewRoleLabel(crewRoleId) || '選択した役職'}として加入を承認しました。`);
            await loadCompanionPage(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '加入申請の承認に失敗しました。', true);
    }
}

async function rejectApplication(playFabId, button) {
    if (!currentGuild?.guildId) return;
    const applicantId = String(button?.dataset?.applicantId || '').trim();
    if (!applicantId) {
        setMessage('拒否する申請を選んでください。', true);
        return;
    }
    if (!confirm('この加入申請を拒否しますか？')) return;
    try {
        const data = await rejectGuildApplication(playFabId, currentGuild.guildId, applicantId, { throwOnError: true });
        if (data?.success) {
            setMessage('加入申請を拒否しました。');
            await loadCompanionPage(playFabId);
        }
    } catch (error) {
        setMessage(error?.message || error?.error || '加入申請の拒否に失敗しました。', true);
    }
}

function bindEvents(playFabId) {
    if (bound) return;
    document.getElementById('btnCreateCrew')?.addEventListener('click', () => createCrew(window.myPlayFabId || playFabId));
    document.getElementById('crewNameInput')?.addEventListener('input', updateCrewCreatePreview);
    document.getElementById('btnCopyCrewInvite')?.addEventListener('click', async () => {
        const value = document.getElementById('crewInviteValue')?.textContent || '';
        const copied = await copyText(value).catch(() => false);
        setMessage(copied ? '勧誘コードをコピーしました。' : 'コピーに失敗しました。', !copied);
    });
    document.getElementById('btnScanJoinCrew')?.addEventListener('click', () => joinCrewFromScan(window.myPlayFabId || playFabId));
    document.getElementById('btnConfirmCrewJoin')?.addEventListener('click', () => confirmCrewJoin(window.myPlayFabId || playFabId));
    document.getElementById('btnCancelCrewJoin')?.addEventListener('click', cancelCrewJoin);
    document.getElementById('btnLeaveCrew')?.addEventListener('click', () => leaveCrew(window.myPlayFabId || playFabId));
    document.getElementById('btnSaveCrewRecruitment')?.addEventListener('click', () => saveRecruitment(window.myPlayFabId || playFabId, true));
    document.getElementById('btnCloseCrewRecruitment')?.addEventListener('click', () => saveRecruitment(window.myPlayFabId || playFabId, false));
    document.getElementById('crewRecruitmentBoardList')?.addEventListener('click', (event) => {
        const button = event.target?.closest?.('.js-apply-crew-recruitment');
        if (!button) return;
        applyToRecruitment(window.myPlayFabId || playFabId, button);
    });
    document.getElementById('crewApplicationsList')?.addEventListener('click', (event) => {
        const approveButton = event.target?.closest?.('.js-approve-crew-application');
        if (approveButton) {
            approveApplication(window.myPlayFabId || playFabId, approveButton);
            return;
        }
        const rejectButton = event.target?.closest?.('.js-reject-crew-application');
        if (rejectButton) {
            rejectApplication(window.myPlayFabId || playFabId, rejectButton);
        }
    });
    bound = true;
}

export async function loadEventPage(playFabId) {
    bindEvents(playFabId);
    await loadCompanionPage(playFabId);
}

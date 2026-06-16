import { CREW_ROLE_DEFS } from './crewRoles.js';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

export function buildRoleAvailabilityMap(availableRoles = null) {
    return new Map(
        Array.isArray(availableRoles)
            ? availableRoles.map((role) => [String(role.id || '').trim(), role.available !== false])
            : []
    );
}

export function isRoleAvailable(availability, roleId) {
    return availability.has(roleId) ? availability.get(roleId) : true;
}

export function getFirstAvailableRoleId(availability) {
    return CREW_ROLE_DEFS.find((role) => isRoleAvailable(availability, role.id))?.id || '';
}

export function buildInviteRoleOptionsHtml(availability) {
    return CREW_ROLE_DEFS.map((role) => {
        const available = isRoleAvailable(availability, role.id);
        return `<option value="${escapeHtml(role.id)}" ${available ? '' : 'disabled'}>${escapeHtml(role.label)} / ${escapeHtml(role.gameLabel)}${available ? '' : '（使用中）'}</option>`;
    }).join('');
}

export function buildInviteRoleGuideHtml(availability, selectedRoleId) {
    return CREW_ROLE_DEFS.map((role) => {
        const available = isRoleAvailable(availability, role.id);
        const selected = selectedRoleId === role.id;
        return `
            <button
                type="button"
                class="crew-role-card ${selected ? 'is-selected' : ''} ${available ? '' : 'is-disabled'} crew-rank-3"
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
}

export function buildRecruitmentRoleGuideHtml(availability, selectedRoleIds) {
    return CREW_ROLE_DEFS.map((role) => {
        const available = isRoleAvailable(availability, role.id);
        const selected = selectedRoleIds.has(role.id);
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
}

export function buildApplicationRoleOptionsHtml(availability, selectedRoleId) {
    return CREW_ROLE_DEFS.map((role) => {
        const available = isRoleAvailable(availability, role.id);
        const selected = role.id === selectedRoleId;
        const disabled = !available && !selected;
        return `<option value="${escapeHtml(role.id)}" ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(role.label)}${available || selected ? '' : '（使用中）'}</option>`;
    }).join('');
}

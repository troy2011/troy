import {
    buildAvatarLayerMarkup,
    cancelAvatarAttackMotion,
    playAvatarBodyMotion,
    renderAvatar,
    startAvatarBodyMotion,
    stopAvatarBodyMotion,
    triggerAvatarAttackMotion
} from './avatar.js?v=20260827-avatar-load-race-v1';

const COMBAT_WEAPON_TYPES = new Set([
    'unarmed',
    'staff',
    'wand',
    'axe',
    'axe_big',
    'blunt',
    'dagger',
    'polearm',
    'shield',
    'sword',
    'sword_big',
    'gun',
    'gun_big',
    'bow'
]);

const COMBAT_WEAPON_CLASS_NAMES = [
    ...Array.from(COMBAT_WEAPON_TYPES, (weapon) => `is-avatar-weapon-${weapon.replace(/_/g, '-')}`)
];

const COMBAT_WEAPON_MOTION_PROFILES = Object.freeze({
    unarmed: Object.freeze({ duration: 340, impactRatio: 0.42, forwardPx: 15, recoilPx: 3, liftPx: 1, shake: Object.freeze({ x: 2, y: 1, duration: 120 }) }),
    dagger: Object.freeze({ duration: 300, impactRatio: 0.32, forwardPx: 19, recoilPx: 2, liftPx: 0, shake: null }),
    wand: Object.freeze({ duration: 380, impactRatio: 0.48, forwardPx: 5, recoilPx: 2, liftPx: 2, shake: null }),
    gun: Object.freeze({ duration: 420, impactRatio: 0.46, forwardPx: 1, recoilPx: 11, liftPx: 1, shake: Object.freeze({ x: 2, y: 1, duration: 130 }) }),
    shield: Object.freeze({ duration: 410, impactRatio: 0.5, forwardPx: 17, recoilPx: 3, liftPx: 0, shake: Object.freeze({ x: 2, y: 1, duration: 140 }) }),
    sword: Object.freeze({ duration: 430, impactRatio: 0.52, forwardPx: 17, recoilPx: 4, liftPx: 0, shake: null }),
    polearm: Object.freeze({ duration: 470, impactRatio: 0.48, forwardPx: 25, recoilPx: 4, liftPx: 0, shake: Object.freeze({ x: 2, y: 1, duration: 150 }) }),
    staff: Object.freeze({ duration: 500, impactRatio: 0.55, forwardPx: 4, recoilPx: 2, liftPx: 3, shake: null }),
    bow: Object.freeze({ duration: 540, impactRatio: 0.66, forwardPx: 1, recoilPx: 5, liftPx: 1, shake: null }),
    axe: Object.freeze({ duration: 540, impactRatio: 0.6, forwardPx: 13, recoilPx: 6, liftPx: 2, shake: Object.freeze({ x: 4, y: 1, duration: 220 }) }),
    blunt: Object.freeze({ duration: 520, impactRatio: 0.58, forwardPx: 12, recoilPx: 6, liftPx: 1, shake: Object.freeze({ x: 4, y: 1, duration: 200 }) }),
    gun_big: Object.freeze({ duration: 620, impactRatio: 0.48, forwardPx: 2, recoilPx: 24, liftPx: 2, shake: Object.freeze({ x: 8, y: 2, duration: 320 }) }),
    sword_big: Object.freeze({ duration: 680, impactRatio: 0.66, forwardPx: 16, recoilPx: 8, liftPx: 3, shake: Object.freeze({ x: 6, y: 2, duration: 280 }) }),
    axe_big: Object.freeze({ duration: 740, impactRatio: 0.74, forwardPx: 16, recoilPx: 10, liftPx: 4, shake: Object.freeze({ x: 8, y: 2, duration: 340 }) })
});

const COMBAT_WEAPON_MOTION_VARIABLES = Object.freeze([
    '--avatar-motion-forward-x',
    '--avatar-motion-recoil-x',
    '--avatar-motion-lift-y'
]);

const combatAvatarTimers = new WeakMap();
const COMBAT_AVATAR_DEATH_FRAME_WIDTH = 56;
const COMBAT_AVATAR_DEATH_FRAME_HEIGHT = 55;
const COMBAT_AVATAR_DEATH_COLUMNS = 8;
const COMBAT_AVATAR_DEATH_FRAME_COUNT = 15;
const COMBAT_AVATAR_DEATH_INTERVAL_MS = 90;
let generatedCombatAvatarId = 0;

function prefersReducedCombatMotion() {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function normalizeCombatWeaponType(value) {
    const key = String(value || '').trim().toLowerCase();
    const aliases = {
        'gun-big': 'gun_big',
        large_gun: 'gun_big',
        'large-gun': 'gun_big',
        claws: 'sword',
        claw_bite: 'sword',
        'claw-bite': 'sword',
        '爪': 'sword',
        fang: 'sword',
        fangs: 'sword',
        '牙': 'sword',
        '噛みつき': 'sword'
    };
    const normalized = aliases[key] || key;
    return COMBAT_WEAPON_TYPES.has(normalized) ? normalized : 'sword';
}

function resolveCombatAvatar(target) {
    if (typeof target === 'string') return document.getElementById(target);
    return target?.nodeType === 1 ? target : null;
}

function ensureCombatAvatarPrefix(element, requestedPrefix = '') {
    if (!element) return '';
    if (requestedPrefix) {
        if (!element.id) element.id = requestedPrefix;
        return requestedPrefix;
    }
    if (element.id) return element.id;
    generatedCombatAvatarId += 1;
    element.id = `combat-avatar-${generatedCombatAvatarId}`;
    return element.id;
}

function getTimerState(element) {
    let state = combatAvatarTimers.get(element);
    if (!state) {
        state = { hurtTimer: null, deathTimer: null };
        combatAvatarTimers.set(element, state);
    }
    return state;
}

function ensureCombatAvatarDeathSprite(element) {
    if (!element) return null;
    let sprite = element.querySelector(':scope > .avatar-combat-death-sprite');
    if (sprite) return sprite;
    sprite = document.createElement('span');
    sprite.className = 'avatar-combat-death-sprite';
    sprite.setAttribute('aria-hidden', 'true');
    element.appendChild(sprite);
    return sprite;
}

function setCombatAvatarDeathFrame(sprite, frameIndex) {
    if (!sprite) return;
    const frame = Math.max(0, Math.min(
        COMBAT_AVATAR_DEATH_FRAME_COUNT - 1,
        Math.floor(Number(frameIndex) || 0)
    ));
    const column = frame % COMBAT_AVATAR_DEATH_COLUMNS;
    const row = Math.floor(frame / COMBAT_AVATAR_DEATH_COLUMNS);
    sprite.dataset.avatarDeathFrame = String(frame);
    sprite.style.backgroundPosition = [
        `${-(column * COMBAT_AVATAR_DEATH_FRAME_WIDTH)}px`,
        `${-(row * COMBAT_AVATAR_DEATH_FRAME_HEIGHT)}px`
    ].join(' ');
}

function stopCombatAvatarDeathMotion(element, { reset = false } = {}) {
    if (!element) return;
    const timerState = getTimerState(element);
    if (timerState.deathTimer) {
        globalThis.clearInterval(timerState.deathTimer);
        timerState.deathTimer = null;
    }
    const sprite = element.querySelector(':scope > .avatar-combat-death-sprite');
    if (!sprite) return;
    delete sprite.dataset.avatarDeathStarted;
    if (reset) setCombatAvatarDeathFrame(sprite, 0);
}

function playCombatAvatarDeathMotion(element) {
    const sprite = ensureCombatAvatarDeathSprite(element);
    if (!sprite) return;
    stopCombatAvatarDeathMotion(element);
    sprite.dataset.avatarDeathStarted = 'true';
    if (prefersReducedCombatMotion()) {
        setCombatAvatarDeathFrame(sprite, COMBAT_AVATAR_DEATH_FRAME_COUNT - 1);
        return;
    }
    let frame = 0;
    setCombatAvatarDeathFrame(sprite, frame);
    const timerState = getTimerState(element);
    timerState.deathTimer = globalThis.setInterval(() => {
        frame += 1;
        setCombatAvatarDeathFrame(sprite, frame);
        if (frame >= COMBAT_AVATAR_DEATH_FRAME_COUNT - 1) {
            globalThis.clearInterval(timerState.deathTimer);
            timerState.deathTimer = null;
        }
    }, COMBAT_AVATAR_DEATH_INTERVAL_MS);
}

function clearCombatWeaponClass(element) {
    element?.classList?.remove(...COMBAT_WEAPON_CLASS_NAMES);
}

function setCombatWeaponMotionVariables(element, profile, direction) {
    if (!element || !profile) return;
    const facing = direction === 'right' ? 1 : -1;
    element.style.setProperty('--avatar-motion-forward-x', `${profile.forwardPx * facing}px`);
    element.style.setProperty('--avatar-motion-recoil-x', `${profile.recoilPx * -facing}px`);
    element.style.setProperty('--avatar-motion-lift-y', `${profile.liftPx * -1}px`);
}

function clearCombatWeaponMotionVariables(element) {
    if (!element) return;
    COMBAT_WEAPON_MOTION_VARIABLES.forEach((property) => element.style.removeProperty(property));
}

function clearCombatAvatarTransientClasses(element) {
    if (!element) return;
    element.classList.remove(
        'is-avatar-attacking',
        'is-avatar-attack-left',
        'is-avatar-attack-right',
        'is-avatar-damaged'
    );
    clearCombatWeaponClass(element);
    clearCombatWeaponMotionVariables(element);
}

function setCombatSideVariables(element, side, kind) {
    const direction = side === 'player' || side === 'right' ? -1 : 1;
    if (kind === 'victory') {
        element.style.setProperty('--avatar-victory-shift-x', `${6 * direction}px`);
        element.style.setProperty('--avatar-victory-rebound-x', `${-3 * direction}px`);
        return;
    }
    element.style.setProperty('--avatar-defeat-head-x', `${10 * direction}px`);
    element.style.setProperty('--avatar-defeat-head-bounce-x', `${-4 * direction}px`);
    element.style.setProperty('--avatar-defeat-head-rest-x', `${3 * direction}px`);
    element.style.setProperty('--avatar-defeat-head-rotate', `${34 * direction}deg`);
    element.style.setProperty('--avatar-defeat-head-bounce-rotate', `${-11 * direction}deg`);
    element.style.setProperty('--avatar-defeat-head-rest-rotate', `${7 * direction}deg`);
}

function clearCombatSideVariables(element, kind) {
    if (kind === 'victory') {
        element.style.removeProperty('--avatar-victory-shift-x');
        element.style.removeProperty('--avatar-victory-rebound-x');
        return;
    }
    element.style.removeProperty('--avatar-defeat-head-x');
    element.style.removeProperty('--avatar-defeat-head-bounce-x');
    element.style.removeProperty('--avatar-defeat-head-rest-x');
    element.style.removeProperty('--avatar-defeat-head-rotate');
    element.style.removeProperty('--avatar-defeat-head-bounce-rotate');
    element.style.removeProperty('--avatar-defeat-head-rest-rotate');
}

/**
 * Return the shared white-melee animation profile for an equipped weapon.
 */
export function getCombatWeaponMotionProfile(weaponType) {
    const weapon = normalizeCombatWeaponType(weaponType);
    const profile = COMBAT_WEAPON_MOTION_PROFILES[weapon] || COMBAT_WEAPON_MOTION_PROFILES.sword;
    return {
        weapon,
        className: `is-avatar-weapon-${weapon.replace(/_/g, '-')}`,
        duration: profile.duration,
        impactRatio: profile.impactRatio,
        forwardPx: profile.forwardPx,
        recoilPx: profile.recoilPx,
        liftPx: profile.liftPx,
        shake: profile.shake ? { ...profile.shake } : null
    };
}

/**
 * Build any missing layers and render an avatar using avatar.js.
 * target may be an element or its DOM id/prefix.
 */
export function renderCombatAvatar(target, avatarBase, equipment = {}, itemSource = {}, options = {}) {
    const element = resolveCombatAvatar(target);
    if (!element) return null;
    const prefix = ensureCombatAvatarPrefix(element, String(options.prefix || ''));
    const expectedBodyId = `${prefix}-layer-body`;
    if (!element.querySelector(`#${CSS.escape(expectedBodyId)}`)) {
        element.innerHTML = buildAvatarLayerMarkup(prefix);
    }
    element.classList.add('avatar-combat-actor');
    if (options.resetState !== false) resetCombatAvatarState(element, { resumeIdle: false });
    renderAvatar(prefix, avatarBase || {}, equipment || {}, itemSource || {}, options.isOpponent === true);
    ensureCombatAvatarDeathSprite(element);
    if (prefersReducedCombatMotion()) stopAvatarBodyMotion(element, { reset: true });
    return element;
}

/**
 * Play the same weapon-specific lunge used by the white-melee battle screens.
 */
export async function playCombatAvatarAttack(target, weaponType, options = {}) {
    const element = resolveCombatAvatar(target);
    if (!element || element.classList.contains('is-avatar-defeated')) return false;
    if (prefersReducedCombatMotion()) return true;
    const profile = getCombatWeaponMotionProfile(weaponType);
    const motionProfile = options.noAdvance === true
        ? { ...profile, forwardPx: 0 }
        : profile;
    const duration = Math.max(120, Number(options.duration || profile.duration) || profile.duration);
    const direction = options.direction === 'right' ? 'right' : 'left';
    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    element.dataset.combatAvatarAttackToken = token;
    clearCombatWeaponClass(element);
    element.classList.add(motionProfile.className);
    setCombatWeaponMotionVariables(element, motionProfile, direction);
    try {
        return await triggerAvatarAttackMotion(element, {
            direction,
            duration,
            bodyMotion: options.bodyMotion ?? false,
            bodyMotionIntervalMs: options.bodyMotionIntervalMs,
            restoreBodyMotion: options.restoreBodyMotion || 'idle'
        });
    } finally {
        if (element.dataset.combatAvatarAttackToken === token) {
            delete element.dataset.combatAvatarAttackToken;
            clearCombatWeaponClass(element);
            clearCombatWeaponMotionVariables(element);
        }
    }
}

/** Flash the shared white-melee hurt state. */
export function flashCombatAvatarHurt(target, options = {}) {
    const element = resolveCombatAvatar(target);
    if (!element || (element.classList.contains('is-avatar-defeated') && options.allowDefeated !== true)) return false;
    const duration = Math.max(80, Number(options.duration || 220) || 220);
    const timerState = getTimerState(element);
    if (timerState.hurtTimer) globalThis.clearTimeout(timerState.hurtTimer);
    element.classList.remove('is-avatar-damaged');
    void element.offsetWidth;
    element.classList.add('is-avatar-damaged');
    timerState.hurtTimer = globalThis.setTimeout(() => {
        element.classList.remove('is-avatar-damaged');
        timerState.hurtTimer = null;
    }, duration);
    return true;
}

/** Toggle the shared white-melee KO/defeat pose. */
export function setCombatAvatarKo(target, defeated = true, options = {}) {
    const element = resolveCombatAvatar(target);
    if (!element) return false;
    const side = options.side || '';
    if (defeated) {
        const alreadyDefeated = element.dataset.avatarDefeated === 'true'
            && element.classList.contains('is-avatar-defeated');
        element.dataset.avatarDefeated = 'true';
        setCombatSideVariables(element, side, 'defeat');
        setCombatAvatarVictory(element, false, options);
        cancelAvatarAttackMotion(element);
        clearCombatAvatarTransientClasses(element);
        stopAvatarBodyMotion(element, { reset: false });
        if (!alreadyDefeated) {
            element.classList.add('is-avatar-defeated');
            playCombatAvatarDeathMotion(element);
        } else if (!element.querySelector(':scope > .avatar-combat-death-sprite')?.dataset.avatarDeathStarted) {
            playCombatAvatarDeathMotion(element);
        }
        return true;
    }
    const wasDefeated = element.dataset.avatarDefeated === 'true'
        || element.classList.contains('is-avatar-defeated');
    delete element.dataset.avatarDefeated;
    stopCombatAvatarDeathMotion(element, { reset: true });
    clearCombatSideVariables(element, 'defeat');
    element.classList.remove('is-avatar-defeated');
    if (
        wasDefeated
        && options.resumeIdle !== false
        && !prefersReducedCombatMotion()
        && element.classList.contains('avatar-combat-actor')
    ) {
        startAvatarBodyMotion(element, 'idle');
    }
    return true;
}

/** Toggle the shared white-melee victory jump. */
export function setCombatAvatarVictory(target, victorious = true, options = {}) {
    const element = resolveCombatAvatar(target);
    if (!element) return false;
    const side = options.side || '';
    if (victorious) {
        if (element.classList.contains('is-avatar-defeated')) return false;
        const alreadyVictorious = element.dataset.avatarVictorious === 'true'
            && element.classList.contains('is-avatar-victorious');
        element.dataset.avatarVictorious = 'true';
        setCombatSideVariables(element, side, 'victory');
        clearCombatAvatarTransientClasses(element);
        if (!alreadyVictorious) {
            if (options.bodyMotion !== false && !prefersReducedCombatMotion()) {
                playAvatarBodyMotion(element, 'jump', {
                    intervalMs: Number(options.intervalMs || 96) || 96,
                    restoreMotion: options.restoreMotion || 'idle'
                });
            }
            element.classList.add('is-avatar-victorious');
        }
        return true;
    }
    delete element.dataset.avatarVictorious;
    clearCombatSideVariables(element, 'victory');
    element.classList.remove('is-avatar-victorious');
    return true;
}

/** Clear transient/terminal combat state and optionally resume idle motion. */
export function resetCombatAvatarState(target, options = {}) {
    const element = resolveCombatAvatar(target);
    if (!element) return false;
    const timerState = getTimerState(element);
    if (timerState.hurtTimer) {
        globalThis.clearTimeout(timerState.hurtTimer);
        timerState.hurtTimer = null;
    }
    delete element.dataset.avatarAttackToken;
    delete element.dataset.combatAvatarAttackToken;
    cancelAvatarAttackMotion(element);
    clearCombatAvatarTransientClasses(element);
    setCombatAvatarVictory(element, false);
    setCombatAvatarKo(element, false);
    stopAvatarBodyMotion(element, { reset: options.resetBody !== false });
    if (options.resumeIdle !== false && !prefersReducedCombatMotion() && element.classList.contains('avatar-combat-actor')) {
        playAvatarBodyMotion(element, 'idle');
    }
    return true;
}

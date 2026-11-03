import { PIXEL_MONSTERS_ROSTER } from './pixelMonstersManifest.js?v=20260825-monster-motion-v2';

// Tarot Kingdom renders both player avatars and pet sprites inside the same
// combat-scale host. Keep this base multiplier shared by every companion view.
// Avatars draw their 32px sprites in a 64px box, so 2 gives a pet the same pixel
// size as its owner; each view then scales both by the same context scale.
export const PIXEL_MONSTER_COMPANION_SCALE = 2;
export const PIXEL_MONSTER_COMPANION_OFFSET_Y = Object.freeze({});

// A pet is shown at its owner's pixel size until its art outgrows this box (about
// 1.5 players tall); larger pets shrink just enough to fit the seat beside the owner.
const PIXEL_MONSTER_PET_MAX_ART_WIDTH = 40;
const PIXEL_MONSTER_PET_MAX_ART_HEIGHT = 36;

// Visible art of each monster's idle animation in sprite pixels: [width, height].
// The sprite frames carry a lot of empty margin, so the frame size cannot be used.
const PIXEL_MONSTER_PET_ART_SIZE = Object.freeze({
    'ismartal-vol1-monster-01': [38, 30], // トゲマル
    'ismartal-vol1-monster-02': [22, 41], // グリモア
    'ismartal-vol1-monster-03': [19, 27], // ボーンテイル
    'ismartal-vol1-monster-04': [39, 32], // ツノガイ
    'ismartal-vol1-monster-05': [13, 13], // ピコアイ
    'ismartal-vol1-monster-06': [38, 32], // ゲルバット
    'ismartal-vol1-monster-07': [19, 25], // マシュロン
    'ismartal-vol1-monster-08': [34, 23], // モクリン
    'ismartal-vol1-monster-09': [34, 46], // ホタルビ
    'ismartal-vol1-monster-10': [26, 20], // リーフロ
    'ismartal-vol1-monster-11': [49, 35], // ガルネズ
    'ismartal-vol1-monster-12': [32, 33], // フェリカ
    'ismartal-vol1-monster-13': [33, 30], // ミドロ
    'ismartal-vol1-monster-14': [40, 40], // ポルポ
    'ismartal-vol1-monster-15': [43, 53], // ガブリラ
    'ismartal-vol1-monster-16': [42, 48], // ツキバネ
    'ismartal-vol1-monster-17': [27, 30], // コバット
    'ismartal-vol1-monster-18': [29, 23], // ラムネロ
    'ismartal-vol1-monster-19': [20, 15], // チュロ
    'ismartal-vol1-monster-20': [66, 32], // アクエル
    'ismartal-vol2-monster-01': [37, 16], // フロス
    'ismartal-vol2-monster-02': [34, 42], // パピル
    'ismartal-vol2-monster-03': [59, 77], // モスガン
    'ismartal-vol2-monster-04': [28, 32], // カブロン
    'ismartal-vol2-monster-05': [34, 25], // リルフィ
    'ismartal-vol2-monster-06': [67, 48], // グリバト
    'ismartal-vol2-monster-08': [26, 35], // ルビット
    'ismartal-vol2-monster-09': [29, 38], // ノッカ
    'ismartal-vol2-monster-10': [48, 38], // ウッドラ
    'ismartal-vol2-monster-11': [34, 42], // ビズン
    'ismartal-vol2-monster-12': [33, 22], // ケロッツ
    'ismartal-vol2-monster-13': [29, 18], // コロック
    'ismartal-vol2-monster-14': [46, 19], // スパイナ
    'ismartal-vol2-monster-17': [40, 31], // メカノ
    'ismartal-vol2-monster-18': [32, 43], // フレマ
    'ismartal-vol2-monster-19': [47, 35], // バクス
    'ismartal-vol2-monster-20': [33, 29], // ネブラ
    'ismartal-vol3-monster-01': [37, 34], // グラヴァ
    'ismartal-vol3-monster-02': [30, 44], // イグニス
    'ismartal-vol3-monster-03': [42, 46], // トルネ
    'ismartal-vol3-monster-04': [19, 19], // プルン
    'ismartal-vol3-monster-05': [40, 28], // モクモ
    'ismartal-vol3-monster-06': [21, 29], // ヨミル
    'ismartal-vol3-monster-07': [28, 32], // グールン
    'ismartal-vol3-monster-08': [26, 30], // キノガル
    'ismartal-vol3-monster-09': [28, 32], // クロモ
    'ismartal-vol3-monster-10': [42, 53] // ノクス
});

/** How much a pet shrinks from its owner's pixel size so that large monsters still fit. */
export function getPixelMonsterPetFitScale(monsterId = '') {
    const artSize = PIXEL_MONSTER_PET_ART_SIZE[String(monsterId || '').trim()];
    if (!artSize) return 1;
    return Math.min(1, PIXEL_MONSTER_PET_MAX_ART_WIDTH / artSize[0], PIXEL_MONSTER_PET_MAX_ART_HEIGHT / artSize[1]);
}

const MONSTER_BY_ID = new Map(PIXEL_MONSTERS_ROSTER.map((monster) => [String(monster.id || ''), monster]));
const animationTimers = new WeakMap();

function stopCompanionAnimation(target) {
    const timerId = animationTimers.get(target);
    if (timerId) clearInterval(timerId);
    animationTimers.delete(target);
}
function setCompanionFrame(sprite, monster, animation, frameIndex) {
    const width = Math.max(1, Number(monster.frameWidth) || 48);
    const height = Math.max(1, Number(monster.frameHeight) || 48);
    const columns = Math.max(1, Number(animation.columns) || 1);
    const frameCount = Math.max(1, Number(animation.frameCount) || 1);
    const rows = Math.max(1, Math.ceil(frameCount / columns));
    const frame = Math.max(0, Math.min(frameCount - 1, Math.floor(Number(frameIndex) || 0)));
    const col = frame % columns;
    const row = Math.floor(frame / columns);
    sprite.style.width = `${width}px`;
    sprite.style.height = `${height}px`;
    sprite.style.backgroundImage = `url('${animation.src}')`;
    sprite.style.backgroundSize = `${columns * width}px ${rows * height}px`;
    sprite.style.backgroundPosition = `-${col * width}px -${row * height}px`;
    sprite.style.backgroundRepeat = 'no-repeat';
    sprite.style.imageRendering = String(monster.renderMode || 'pixel') === 'illustration' ? 'auto' : 'pixelated';
}

function startCompanionIdle(target, sprite, monster) {
    stopCompanionAnimation(target);
    const animation = monster.animations?.idle;
    if (!animation) return;
    const frameCount = Math.max(1, Number(animation.frameCount) || 1);
    let frame = 0;
    setCompanionFrame(sprite, monster, animation, frame);
    if (frameCount <= 1 || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const intervalMs = Math.max(80, Math.round(1000 / Math.max(1, Number(animation.fps) || 10)));
    const timerId = setInterval(() => {
        if (!target.isConnected || target.hidden) {
            stopCompanionAnimation(target);
            return;
        }
        frame = (frame + 1) % frameCount;
        setCompanionFrame(sprite, monster, animation, frame);
    }, intervalMs);
    animationTimers.set(target, timerId);
}

export function getPixelMonsterCompanion(monsterId = '') {
    return MONSTER_BY_ID.get(String(monsterId || '').trim()) || null;
}

export function renderPixelMonsterCompanion(targetOrId, pet = null) {
    const target = typeof targetOrId === 'string'
        ? document.getElementById(targetOrId)
        : targetOrId;
    if (!target) return false;
    const monster = getPixelMonsterCompanion(pet?.monsterId);
    stopCompanionAnimation(target);
    target.innerHTML = '';
    target.hidden = !monster;
    target.classList.toggle('has-monster', !!monster);
    if (!monster) {
        target.removeAttribute('aria-label');
        delete target.dataset.monsterId;
        delete target.dataset.monsterAnchor;
        delete target.dataset.petLevel;
        return false;
    }

    const anchorMode = monster.idleAnchor?.mode === 'air' ? 'air' : 'ground';
    const frameWidth = Math.max(1, Number(monster.frameWidth) || 48);
    const frameHeight = Math.max(1, Number(monster.frameHeight) || 48);
    const anchorX = Math.max(0, Math.min(frameWidth, Number(monster.idleAnchor?.x) || (frameWidth / 2)));
    const anchorY = Math.max(0, Math.min(frameHeight, Number(monster.idleAnchor?.y) || frameHeight));
    const scale = PIXEL_MONSTER_COMPANION_SCALE * getPixelMonsterPetFitScale(monster.id);
    const configuredOffset = Object.prototype.hasOwnProperty.call(
        PIXEL_MONSTER_COMPANION_OFFSET_Y,
        String(monster.id || '')
    )
        ? PIXEL_MONSTER_COMPANION_OFFSET_Y[String(monster.id || '')]
        : Number(monster.battleOffsetY) || 0;
    const renderedWidth = frameWidth * scale;
    target.dataset.monsterId = String(monster.id || '');
    target.dataset.monsterAnchor = anchorMode;
    const petLevel = Math.max(1, Math.floor(Number(pet?.level) || 1));
    target.dataset.petLevel = String(petLevel);
    target.setAttribute(
        'aria-label',
        `${String(pet?.nickname || pet?.displayName || pet?.monsterName || monster.name || 'ペット')}（ペット Lv${petLevel}）`
    );
    target.style.setProperty('--pixel-monster-companion-shadow-width', `${Math.max(34, Math.min(68, Math.round(renderedWidth * 0.72)))}px`);
    target.style.setProperty('--pixel-monster-companion-offset-y', `${Math.max(-24, Math.min(24, configuredOffset))}px`);
    target.style.setProperty('--pixel-monster-companion-frame-height', `${frameHeight}px`);
    target.style.setProperty('--pixel-monster-companion-anchor-x', `${anchorX}px`);
    target.style.setProperty('--pixel-monster-companion-anchor-y', `${anchorY}px`);
    target.style.setProperty('--pixel-monster-companion-scale', String(scale));
    target.style.setProperty('--pixel-monster-companion-scale-x', monster.flipX === true ? '-1' : '1');
    target.style.setProperty('--pixel-monster-companion-scale-y', monster.flipY === true ? '-1' : '1');
    target.style.setProperty('--pixel-monster-companion-origin-y', monster.flipY === true ? '50%' : `${anchorY}px`);

    const shadow = document.createElement('span');
    shadow.className = 'pixel-monster-companion-shadow';
    shadow.setAttribute('aria-hidden', 'true');
    const sprite = document.createElement('span');
    sprite.className = 'pixel-monster-companion-sprite';
    sprite.setAttribute('aria-hidden', 'true');
    target.append(shadow, sprite);
    startCompanionIdle(target, sprite, monster);
    return true;
}

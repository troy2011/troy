// c:/Users/ikeda/my-liff-app/public/js/avatar.js

import { AVATAR_PART_OFFSETS } from './config.js';
import { buildTarotCardMeta } from './tarotCards.js';
import { FEATURE_UNLOCK_LEVELS } from './featureUnlocks.js';

const AVATAR_BODY_MOTIONS = Object.freeze({
    idle: { row: 0, count: 4, intervalMs: 500, loop: true, layerShift: [0, 1, 2, 1] },
    walk: { row: 1, count: 8, intervalMs: 95, loop: true, layerShift: [0, 1, 1, 2, 2, 1, 1, 0] },
    run: { row: 2, count: 8, intervalMs: 68, loop: true, layerShift: [0, 1, 2, 1, 0, 1, 2, 1] },
    jump: { row: 3, count: 3, intervalMs: 120, loop: false, layerShift: [0, 2, -3] }
});

const AVATAR_LAYER_NAMES = Object.freeze([
    'body',
    'head',
    'facial-hair',
    'hair',
    'armor',
    'hand-right',
    'weapon-right',
    'hand-left',
    'shield-left'
]);

const AVATAR_ASSET_RACES = Object.freeze(new Set(['human', 'elf', 'orc', 'goblin']));
const AVATAR_FALLBACK_RACE = 'human';
const AVATAR_FALLBACK_COLOR = 'brown';
const AVATAR_HAIR_COLOR_BY_INDEX = Object.freeze([
    null,
    null,
    'black',
    'blue',
    'brown',
    'gold',
    'green',
    'purple',
    'red',
    'silver',
    'yellow'
]);
const activeAvatarAttackMotions = new WeakMap();

function resolveAvatarAssetRace(value) {
    const race = String(value || 'human').trim().toLowerCase();
    return AVATAR_ASSET_RACES.has(race) ? race : AVATAR_FALLBACK_RACE;
}

function resolveAvatarHairSpriteColor(indexValue, fallbackColor) {
    const index = Math.floor(Number(indexValue) || 1);
    return AVATAR_HAIR_COLOR_BY_INDEX[index]
        || resolveAvatarBaseSpriteColor(AVATAR_FALLBACK_RACE, fallbackColor);
}

function uniqueSpritePaths(paths) {
    return Array.from(new Set(paths.filter(Boolean)));
}

function avatarCharacterSpriteFallbacks(spritePath) {
    const rawPath = String(spritePath || '');
    if (!rawPath.includes('/Sprites/Characters/')) return [rawPath];
    const candidates = [rawPath];
    const raceMatch = rawPath.match(/^(.*\/Sprites\/Characters\/)([^/]+)(\/.+)$/i);
    if (raceMatch) {
        const [, prefix, rawRace, suffix] = raceMatch;
        const race = String(rawRace || '').toLowerCase();
        const assetRace = resolveAvatarAssetRace(race);
        if (assetRace !== race) {
            candidates.push(`${prefix}${assetRace}${suffix}`.replace(new RegExp(`/${race}_`, 'i'), `/${assetRace}_`));
        }
    }
    const expanded = [...candidates];
    for (const path of candidates) {
        if (/_skin_\d+(\.[a-z0-9]+)$/i.test(path)) {
            expanded.push(path.replace(/_skin_\d+(\.[a-z0-9]+)$/i, '_skin_1$1'));
        }
        if (/_(black|blue|brown|gold|green|grey|orange|pink|purple|red|silver|yellow)(\.[a-z0-9]+)$/i.test(path)) {
            expanded.push(path.replace(/_(black|blue|brown|gold|green|grey|orange|pink|purple|red|silver|yellow)(\.[a-z0-9]+)$/i, `_${AVATAR_FALLBACK_COLOR}$2`));
        }
    }
    return uniqueSpritePaths(expanded);
}

export function buildAvatarLayerMarkup(prefix) {
    return AVATAR_LAYER_NAMES
        .map((name) => `<div id="${prefix}-layer-${name}" class="avatar-layer"></div>`)
        .join('');
}

export function cancelAvatarAttackMotion(target) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    const cancel = element ? activeAvatarAttackMotions.get(element) : null;
    if (typeof cancel !== 'function') return false;
    cancel();
    return true;
}

export function triggerAvatarAttackMotion(target, options = {}) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element) return Promise.resolve(false);
    if (element.classList.contains('is-avatar-defeated')) return Promise.resolve(false);
    cancelAvatarAttackMotion(element);
    const direction = options.direction === 'right' ? 'right' : 'left';
    const duration = Math.max(120, Number(options.duration || 520) || 520);
    if (options.bodyMotion !== false && element.classList.contains('avatar-combat-actor')) {
        playAvatarBodyMotion(element, options.bodyMotion || 'run', {
            intervalMs: options.bodyMotionIntervalMs,
            restoreMotion: options.restoreBodyMotion || 'idle'
        });
    }
    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    element.dataset.avatarAttackToken = token;
    element.classList.remove('is-avatar-attacking', 'is-avatar-attack-left', 'is-avatar-attack-right');
    void element.offsetWidth;
    element.style.setProperty('--avatar-attack-duration', `${duration}ms`);
    element.classList.add('is-avatar-attacking', `is-avatar-attack-${direction}`);
    return new Promise((resolve) => {
        let finished = false;
        let fallbackTimer = null;
        const finish = (completed = true) => {
            if (finished) return;
            finished = true;
            if (fallbackTimer) {
                window.clearTimeout(fallbackTimer);
                fallbackTimer = null;
            }
            element.removeEventListener('animationend', handleAnimationEnd);
            if (activeAvatarAttackMotions.get(element) === cancel) activeAvatarAttackMotions.delete(element);
            if (element.dataset.avatarAttackToken !== token) {
                resolve(false);
                return;
            }
            delete element.dataset.avatarAttackToken;
            element.classList.remove('is-avatar-attacking', 'is-avatar-attack-left', 'is-avatar-attack-right');
            resolve(completed);
        };
        const handleAnimationEnd = () => finish(true);
        const cancel = () => finish(false);
        activeAvatarAttackMotions.set(element, cancel);
        element.addEventListener('animationend', handleAnimationEnd, { once: true });
        fallbackTimer = window.setTimeout(handleAnimationEnd, duration + 80);
    });
}

const spritePromiseCache = new Map();
const ITEM_SPRITE_PRESETS = Object.freeze([
    { idPrefixes: ['accessory_', 'offhand_'], path: './Sprites/items/icons.png', width: 16, height: 16, cols: 16, twoHanded: false },
    { idPrefixes: ['hat_black_'], path: './Sprites/wardrobe/cloth/hat_black.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['hat_straw_'], path: './Sprites/wardrobe/cloth/hat_straw.png', width: 32, height: 32, cols: 5, twoHanded: false },
    { idPrefixes: ['leather01_'], path: './Sprites/wardrobe/leather/leather01.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['leather02_'], path: './Sprites/wardrobe/leather/leather02.png', width: 32, height: 48, cols: 4, twoHanded: false },
    { idPrefixes: ['metal_black_'], path: './Sprites/wardrobe/metal/metal_black.png', width: 32, height: 48, cols: 10, twoHanded: false },
    { idPrefixes: ['metal_'], path: './Sprites/wardrobe/metal/metal.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['shield_'], path: './Sprites/weapons/melee weapons/shield.png', width: 32, height: 32, cols: 10, twoHanded: false, avatarOffset: { shieldLeft: { x: -3, y: -2 } } },
    { idPrefixes: ['sword_big_'], path: './Sprites/weapons/melee weapons/sword_big.png', width: 32, height: 48, cols: 10, twoHanded: true, avatarOffset: { weaponRight: { x: 0, y: -24 } } },
    { idPrefixes: ['sword_'], path: './Sprites/weapons/melee weapons/sword.png', width: 32, height: 32, cols: 7, twoHanded: false, avatarOffset: { weaponRight: { x: -2, y: 2 } } },
    { idPrefixes: ['dagger_'], path: './Sprites/weapons/melee weapons/dagger.png', width: 32, height: 32, cols: 7, twoHanded: false, avatarOffset: { weaponRight: { x: 2, y: 4 } } },
    { idPrefixes: ['axe_big_'], path: './Sprites/weapons/melee weapons/axe_big.png', width: 32, height: 48, cols: 5, twoHanded: true, avatarOffset: { weaponRight: { x: 0, y: -24 } } },
    { idPrefixes: ['axe_'], path: './Sprites/weapons/melee weapons/axe.png', width: 32, height: 32, cols: 10, twoHanded: false, avatarOffset: { weaponRight: { x: -4, y: 5 } } },
    { idPrefixes: ['blunt_'], path: './Sprites/weapons/melee weapons/blunt.png', width: 32, height: 32, cols: 10, twoHanded: false, avatarOffset: { weaponRight: { x: -3, y: 5 } } },
    { idPrefixes: ['polearm_'], path: './Sprites/weapons/melee weapons/polearm.png', width: 32, height: 64, cols: 12, twoHanded: true, avatarOffset: { weaponRight: { x: -2, y: -42 } } },
    { idPrefixes: ['staff_'], path: './Sprites/weapons/magic weapons/staff.png', width: 32, height: 64, cols: 13, twoHanded: false, weaponType: 'staff', avatarOffset: { weaponRight: { x: -1, y: -42 } } },
    { idPrefixes: ['wand_'], path: './Sprites/weapons/magic weapons/wand.png', width: 32, height: 32, cols: 6, twoHanded: false, weaponType: 'staff', avatarOffset: { weaponRight: { x: 2, y: 4 } } },
    { idPrefixes: ['gun_big_'], path: './Sprites/weapons/ranged weapons/pistol_big.png', width: 64, height: 32, cols: 5, twoHanded: true, avatarOffset: { weaponRight: { x: -34, y: 12 } } },
    { idPrefixes: ['gun_'], path: './Sprites/weapons/ranged weapons/pistol.png', width: 32, height: 32, cols: 4, twoHanded: false, avatarOffset: { weaponRight: { x: -2, y: 9 } } }
]);

function resolveAvatarSpritePreset(item) {
    const data = item?.customData || item || {};
    const itemId = String(item?.itemId || data?.ItemId || data?.FriendlyId || '').trim().toLowerCase();
    const spritePath = String(data?.sprite_path || '').trim().toLowerCase();
    return ITEM_SPRITE_PRESETS.find((preset) =>
        (spritePath && spritePath === String(preset.path).toLowerCase())
        || preset.idPrefixes.some((prefix) => itemId.startsWith(prefix))
    ) || null;
}

function normalizeSpriteFrameSize(imageUrl, spriteWidth = 32, spriteHeight = 32, item = null) {
    const preset = resolveAvatarSpritePreset(item || { sprite_path: imageUrl });
    if (preset) {
        return { width: preset.width, height: preset.height, path: preset.path };
    }
    return { width: Number(spriteWidth) || 32, height: Number(spriteHeight) || 32, path: imageUrl };
}

function getAvatarLayerOffset(imageUrl, layerId) {
    const preset = resolveAvatarSpritePreset({ sprite_path: imageUrl });
    if (!preset?.avatarOffset) return { x: 0, y: 0 };
    if (layerId.includes('weapon-right')) return preset.avatarOffset.weaponRight || { x: 0, y: 0 };
    if (layerId.includes('shield-left')) return preset.avatarOffset.shieldLeft || { x: 0, y: 0 };
    return { x: 0, y: 0 };
}

function isAvatarShieldItem(imageUrl, itemCategory) {
    if (String(itemCategory || '').trim().toLowerCase() === 'shield') return true;
    const preset = resolveAvatarSpritePreset({ sprite_path: imageUrl });
    return !!preset?.idPrefixes?.some((prefix) => prefix === 'shield_');
}

function getAvatarItemSpriteMeta(item) {
    const data = item?.customData || {};
    const preset = resolveAvatarSpritePreset(item);
    if (preset) {
        return {
            path: preset.path,
            index: parseInt(data.sprite_index, 10) || 0,
            width: preset.width,
            height: preset.height
        };
    }
    return {
        path: data.sprite_path,
        index: parseInt(data.sprite_index, 10) || 0,
        width: parseInt(data.sprite_w, 10) || 32,
        height: parseInt(data.sprite_h, 10) || 32
    };
}

function isTwoHandedAvatarWeapon(item) {
    const data = item?.customData || {};
    if (String(data?.Category || '').trim() !== 'Weapon') return false;
    if (data?.TwoHanded === true || String(data?.TwoHanded || '').trim().toLowerCase() === 'true') {
        return true;
    }
    const preset = resolveAvatarSpritePreset(item);
    if (preset && typeof preset.twoHanded === 'boolean') {
        return preset.twoHanded;
    }
    return (parseInt(data.sprite_w, 10) || 0) > 32 || (parseInt(data.sprite_h, 10) || 0) > 32;
}

function loadSpriteImage(url) {
    if (!url) return Promise.resolve(null);
    if (spritePromiseCache.has(url)) return spritePromiseCache.get(url);
    const img = new Image();
    let done = false;
    const promise = new Promise((resolve) => {
        const finish = (ok) => {
            if (done) return;
            done = true;
            resolve(ok ? img : null);
        };
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.decoding = 'async';
        img.src = url;
        if (img.complete) {
            finish(!!img.naturalWidth);
        }
    });
    spritePromiseCache.set(url, promise);
    return promise;
}

function normalizeAvatarColor(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const aliasMap = {
        fire: 'red',
        water: 'blue',
        wind: 'yellow',
        earth: 'green',
        neutral: 'black'
    };
    return aliasMap[raw] || raw;
}

function resolveAvatarBaseSpriteColor(race, value) {
    const color = normalizeAvatarColor(value) || AVATAR_FALLBACK_COLOR;
    return color;
}

export function resolveSpritePathByAvatarColor(spritePath, itemCategory = null, avatarColor = null) {
    if (!spritePath || typeof spritePath !== 'string') return spritePath;
    if (String(itemCategory || '').toLowerCase() !== 'armor') return spritePath;
    if (!/_black\.[a-z0-9]+$/i.test(spritePath)) return spritePath;
    const normalizedColor = normalizeAvatarColor(avatarColor || window.myAvatarBaseInfo?.AvatarColor);
    if (!normalizedColor || normalizedColor === 'black') return spritePath;
    return spritePath.replace(/_black(\.[a-z0-9]+)$/i, `_${normalizedColor}$1`);
}

function getSpritePathCandidates(spritePath, itemCategory = null, avatarColor = null) {
    const resolved = resolveSpritePathByAvatarColor(spritePath, itemCategory, avatarColor);
    return uniqueSpritePaths([
        ...avatarCharacterSpriteFallbacks(resolved),
        ...avatarCharacterSpriteFallbacks(spritePath)
    ]);
}

function clearEquipmentSlotArt(artEl) {
    if (!artEl) return;
    artEl.classList.remove('has-item', 'is-loading', 'is-error');
    artEl.removeAttribute('data-art-key');
    artEl.innerHTML = '';
}

function cropVisibleSpriteFrame(img, sourceX, sourceY, frameWidth, frameHeight) {
    try {
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = frameWidth;
        frameCanvas.height = frameHeight;
        const frameContext = frameCanvas.getContext('2d');
        if (!frameContext) return null;
        frameContext.drawImage(img, sourceX, sourceY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);

        const { data } = frameContext.getImageData(0, 0, frameWidth, frameHeight);
        let minX = frameWidth;
        let minY = frameHeight;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < frameHeight; y += 1) {
            for (let x = 0; x < frameWidth; x += 1) {
                const alpha = data[((y * frameWidth + x) * 4) + 3];
                if (alpha <= 8) continue;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }

        if (maxX < minX || maxY < minY) return null;
        const pad = 1;
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropRight = Math.min(frameWidth - 1, maxX + pad);
        const cropBottom = Math.min(frameHeight - 1, maxY + pad);
        const cropWidth = cropRight - cropX + 1;
        const cropHeight = cropBottom - cropY + 1;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropContext = cropCanvas.getContext('2d');
        if (!cropContext) return null;
        cropContext.drawImage(frameCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        return {
            url: cropCanvas.toDataURL('image/png'),
            width: cropWidth,
            height: cropHeight
        };
    } catch {
        return null;
    }
}

function renderEquipmentSlotArt(artId, item, avatarColor = null) {
    const artEl = document.getElementById(artId);
    if (!artEl) return;
    if (!item?.customData) {
        clearEquipmentSlotArt(artEl);
        return;
    }

    const spriteMeta = getAvatarItemSpriteMeta(item);
    const spritePath = spriteMeta.path;
    const spriteIndex = Number.parseInt(spriteMeta.index, 10) || 0;
    const spriteWidth = Number(spriteMeta.width) || 32;
    const spriteHeight = Number(spriteMeta.height) || 32;
    if (!spritePath || spriteIndex < 0) {
        clearEquipmentSlotArt(artEl);
        return;
    }

    const category = item.customData?.Category || null;
    const artKey = [
        item.itemId || item.id || item.customData?.ItemId || item.name || '',
        spritePath,
        spriteIndex
    ].join('|');
    artEl.dataset.artKey = artKey;
    artEl.classList.add('is-loading');
    artEl.classList.remove('has-item', 'is-error');

    const pathCandidates = getSpritePathCandidates(spritePath, category, avatarColor);
    const tryApplyImage = (candidateIndex) => {
        const currentUrl = pathCandidates[candidateIndex];
        loadSpriteImage(currentUrl).then((img) => {
            if (artEl.dataset.artKey !== artKey) return;
            if (!img) {
                if (candidateIndex + 1 < pathCandidates.length) {
                    tryApplyImage(candidateIndex + 1);
                    return;
                }
                clearEquipmentSlotArt(artEl);
                artEl.classList.add('is-error');
                return;
            }

            const normalizedSize = normalizeSpriteFrameSize(currentUrl, spriteWidth, spriteHeight, item);
            const frameWidth = normalizedSize.width;
            const frameHeight = normalizedSize.height;
            const naturalWidth = img.naturalWidth || img.width || frameWidth;
            const naturalHeight = img.naturalHeight || img.height || frameHeight;
            const columns = Math.max(1, Math.floor(naturalWidth / frameWidth));
            const col = spriteIndex % columns;
            const row = Math.floor(spriteIndex / columns);
            const croppedFrame = cropVisibleSpriteFrame(
                img,
                col * frameWidth,
                row * frameHeight,
                frameWidth,
                frameHeight
            );
            const displayUrl = croppedFrame?.url || currentUrl;
            const displayWidth = croppedFrame?.width || frameWidth;
            const displayHeight = croppedFrame?.height || frameHeight;
            const artRect = artEl.getBoundingClientRect();
            const artFitSize = Math.max(24, Math.min(52, Math.floor(Math.min(artRect.width || 52, artRect.height || 52) - 4)));
            const fitSize = artFitSize;
            const previewScale = Math.min(4, Math.max(0.6, fitSize / Math.max(displayWidth, displayHeight)));
            const spriteEl = document.createElement('div');
            spriteEl.className = 'equip-slot-item-sprite';
            spriteEl.style.width = `${displayWidth}px`;
            spriteEl.style.height = `${displayHeight}px`;
            spriteEl.style.backgroundImage = `url('${displayUrl}')`;
            spriteEl.style.backgroundSize = croppedFrame
                ? `${displayWidth}px ${displayHeight}px`
                : `${naturalWidth}px ${naturalHeight}px`;
            spriteEl.style.backgroundPosition = croppedFrame
                ? '0 0'
                : `${-(col * frameWidth)}px ${-(row * frameHeight)}px`;
            if (String(category || '').trim() === 'Armor') {
                spriteEl.style.position = 'relative';
                spriteEl.style.top = '-4px';
            }
            spriteEl.style.transform = `scale(${previewScale})`;

            artEl.innerHTML = '';
            artEl.appendChild(spriteEl);
            artEl.classList.add('has-item');
            artEl.classList.remove('is-loading', 'is-error');
        });
    };

    tryApplyImage(0);
}

/**
 * アバターの各パーツ（レイヤー）のスタイルを設定して描画する
 * @param {string} layerId - 操作対象のDOM要素ID
 * @param {string} imageUrl - スプライトシートのURL
 * @param {number} spriteIndex - スプライトシート内のインデックス
 * @param {number} spriteWidth - 1フレームの幅
 * @param {number} spriteHeight - 1フレームの高さ
 * @param {string} itemCategory - アイテムのカテゴリ（武器、盾など）
 */
function setAvatarPart(layerId, imageUrl, spriteIndex, spriteWidth = 32, spriteHeight = 32, itemCategory = null, onReady = null, avatarColor = null) {
    const layer = document.getElementById(layerId);
    if (!layer) {
        if (typeof onReady === 'function') onReady();
        return;
    }
    layer.dataset.loadState = 'loading';

    if (!imageUrl || spriteIndex < 0) {
        layer.style.backgroundImage = 'none';
        layer.style.left = '';
        layer.style.top = '';
        layer.dataset.spriteWidth = '';
        layer.dataset.spriteHeight = '';
        layer.dataset.sheetColumns = '';
        layer.dataset.scale = '';
        layer.dataset.spriteIndex = '';
        layer.dataset.baseTransform = '';
        layer.style.removeProperty('--avatar-layer-base-transform');
        layer.dataset.loadState = 'ready';
        if (typeof onReady === 'function') onReady();
        return;
    }
    const pathCandidates = getSpritePathCandidates(imageUrl, itemCategory, avatarColor);
    const tryApplyImage = (candidateIndex) => {
        const currentUrl = pathCandidates[candidateIndex];
        loadSpriteImage(currentUrl).then((img) => {
            if (!img) {
                if (candidateIndex + 1 < pathCandidates.length) {
                    tryApplyImage(candidateIndex + 1);
                    return;
                }
                layer.style.backgroundImage = 'none';
                layer.style.left = '';
                layer.style.top = '';
                layer.dataset.loadState = 'error';
                if (typeof onReady === 'function') onReady();
                return;
            }
            layer.style.backgroundImage = `url('${currentUrl}')`;
            const normalizedSize = normalizeSpriteFrameSize(currentUrl, spriteWidth, spriteHeight);
            spriteWidth = normalizedSize.width;
            spriteHeight = normalizedSize.height;
            const isShieldItem = isAvatarShieldItem(currentUrl, itemCategory);
            const scale = 2; // アバターの表示倍率
            layer.style.width = `${spriteWidth * scale}px`;
            layer.style.height = `${spriteHeight * scale}px`;

            // 兜/防具はサイズ違いでも下面合わせにする。
            // 武器はフレーム内の透明余白に手元位置が含まれるため、高さ補正しない。
            const isArmorLayer = layerId.includes('layer-armor');
            const isEquipmentLayer = isArmorLayer
                || layerId.includes('weapon-right')
                || layerId.includes('shield-left');
            let topOffset = 0;
            let leftOffset = 0;
            if (isArmorLayer) {
                topOffset = Math.round((32 - spriteHeight) * scale);
            }
            if (isEquipmentLayer) {
                if (spriteWidth < 32) {
                    leftOffset = Math.round(((32 - spriteWidth) * scale) / 2);
                }
            }
            layer.style.left = `${leftOffset}px`;
            layer.style.top = `${topOffset}px`;

            // パーツごとの位置オフセットを適用
            let transformValue = '';
            if (layerId.includes('layer-armor')) {
                transformValue += ` translateY(${AVATAR_PART_OFFSETS.armor.y}px)`;
            } else if (layerId.includes('hand-right')) {
                transformValue += ` translateX(${AVATAR_PART_OFFSETS.handRight.x}px) translateY(${AVATAR_PART_OFFSETS.handRight.y}px)`;
            } else if (layerId.includes('hand-left')) {
                const handOffset = itemCategory === 'TwoHandedGrip'
                    ? AVATAR_PART_OFFSETS.handLeftTwoHanded
                    : AVATAR_PART_OFFSETS.handLeft;
                transformValue += ` translateX(${handOffset.x}px) translateY(${handOffset.y}px)`;
            } else if (layerId.includes('weapon-right')) {
                let offsetX = AVATAR_PART_OFFSETS.rightHandItem.x;
                let offsetY = AVATAR_PART_OFFSETS.rightHandItem.y;
                const itemOffset = getAvatarLayerOffset(currentUrl, layerId);
                offsetX += itemOffset.x;
                offsetY += itemOffset.y;
                if (isShieldItem) {
                    offsetX += AVATAR_PART_OFFSETS.shield.x;
                    offsetY += AVATAR_PART_OFFSETS.shield.y;
                }
                transformValue += ` translateX(${offsetX}px) translateY(${offsetY}px)`;
            } else if (layerId.includes('shield-left')) {
                let offsetX = AVATAR_PART_OFFSETS.leftHandItem.x;
                let offsetY = AVATAR_PART_OFFSETS.leftHandItem.y;
                const itemOffset = getAvatarLayerOffset(currentUrl, layerId);
                offsetX += itemOffset.x;
                offsetY += itemOffset.y;
                if (isShieldItem) {
                    offsetX += AVATAR_PART_OFFSETS.shield.x;
                    offsetY += AVATAR_PART_OFFSETS.shield.y;
                }
                transformValue += ` translateX(${offsetX}px) translateY(${offsetY}px)`;
            }

            const baseTransform = transformValue.trim() || 'none';
            layer.style.transform = baseTransform;
            layer.dataset.baseTransform = baseTransform;
            layer.style.setProperty(
                '--avatar-layer-base-transform',
                baseTransform === 'none' ? 'translate(0px, 0px)' : baseTransform
            );

            // スプライトシートの表示位置を計算
            const imgWidth = img.naturalWidth || img.width;
            const imgHeight = img.naturalHeight || img.height;
            const sheetColumns = Math.max(1, Math.floor(imgWidth / spriteWidth));
            layer.style.backgroundSize = `${imgWidth * scale}px ${imgHeight * scale}px`;
            const col = spriteIndex % sheetColumns;
            const row = Math.floor(spriteIndex / sheetColumns);
            const posX = -(col * spriteWidth * scale);
            const posY = -(row * spriteHeight * scale);
            layer.style.backgroundPosition = `${posX}px ${posY}px`;

            layer.dataset.spriteWidth = String(spriteWidth);
            layer.dataset.spriteHeight = String(spriteHeight);
            layer.dataset.sheetColumns = String(sheetColumns);
            layer.dataset.scale = String(scale);
            layer.dataset.spriteIndex = String(spriteIndex);
            layer.dataset.loadState = 'ready';
            if (typeof onReady === 'function') onReady();
        });
    };

    tryApplyImage(0);
}

export function preloadAvatarBaseSprites(avatarBase) {
    if (!avatarBase) return;
    const { Race, AvatarColor, SkinColorIndex, FaceIndex, HairStyleIndex, FacialHairStyleIndex, level } = avatarBase;
    const race = resolveAvatarAssetRace(Race);
    const color = resolveAvatarBaseSpriteColor(race, AvatarColor);
    const skinIndex = SkinColorIndex || 1;
    const faceIdx = (FaceIndex || 1) - 1;
    const hairIdx = (level >= FEATURE_UNLOCK_LEVELS.hairVisible && HairStyleIndex) ? (HairStyleIndex - 1) : -1;
    const facialHairStyle = Number(FacialHairStyleIndex);
    const facialHairIdx = (
        level >= FEATURE_UNLOCK_LEVELS.facialHairVisible
        && Number.isFinite(facialHairStyle)
        && facialHairStyle > 0
    ) ? (Math.floor(facialHairStyle) - 1) : -1;
    const bodyUrl = `./Sprites/Characters/body/body_${color}.png`;
    const headUrl = `./Sprites/Characters/${race}/head/${race}_head_skin_${skinIndex}.png`;
    const hairUrl = hairIdx >= 0 ? `./Sprites/Characters/${race}/hair/hairstyle/${race}_hair_${color}.png` : null;
    const facialHairUrl = facialHairIdx >= 0 ? `./Sprites/Characters/${race}/hair/facial hair/${race}_facialhair_${color}.png` : null;
    const handUrl = `./Sprites/Characters/${race}/hand/${race}_hand.png`;
    loadSpriteImage(bodyUrl);
    loadSpriteImage(headUrl);
    if (facialHairUrl) loadSpriteImage(facialHairUrl);
    if (hairUrl) loadSpriteImage(hairUrl);
    loadSpriteImage(handUrl);
}

export function preloadEquipmentSprites(equipment, itemSource, avatarColor = null) {
    if (!equipment) return;
    const items = [
        getAvatarEquipmentItemDetails(equipment.RightHand, itemSource),
        getAvatarEquipmentItemDetails(equipment.LeftHand, itemSource),
        getAvatarEquipmentItemDetails(equipment.Armor, itemSource),
        getAvatarEquipmentItemDetails(equipment.Accessory, itemSource)
    ].filter(Boolean);
    items.forEach((item) => {
        const spriteMeta = getAvatarItemSpriteMeta(item);
        const path = spriteMeta.path;
        const category = item?.customData?.Category || null;
        const resolvedPath = resolveSpritePathByAvatarColor(path, category, avatarColor);
        if (resolvedPath) loadSpriteImage(resolvedPath);
        if (path && resolvedPath && path !== resolvedPath) loadSpriteImage(path);
    });
}

function getAvatarEquipmentReferenceIds(value) {
    if (!value) return [];
    if (typeof value !== 'object') {
        const id = String(value || '').trim();
        return id ? [id] : [];
    }
    const refs = [
        value.itemId,
        value.ItemId,
        value.id,
        value.Id,
        value.instanceId,
        value.InstanceId,
        value.instanceID,
        value.InstanceID,
        value.itemInstanceId,
        value.ItemInstanceId,
        value.ItemInstanceID,
        value?.Item?.Id,
        value?.Item?.itemId
    ];
    return refs
        .map((ref) => String(ref || '').trim())
        .filter(Boolean);
}

function getAvatarInventoryItemReferenceIds(item) {
    const refs = [
        item?.itemId,
        item?.ItemId,
        item?.id,
        item?.Id,
        ...(Array.isArray(item?.instances) ? item.instances : []),
        item?.instanceId,
        item?.InstanceId,
        item?.itemInstanceId,
        item?.ItemInstanceId
    ];
    return refs
        .map((ref) => String(ref || '').trim())
        .filter(Boolean);
}

function getAvatarEquipmentItemDetails(reference, itemSource) {
    if (!reference) return null;
    if (typeof reference === 'object' && reference.customData) return reference;
    const referenceIds = getAvatarEquipmentReferenceIds(reference);
    if (!referenceIds.length) return null;
    if (Array.isArray(itemSource)) {
        return itemSource.find((item) => {
            const itemRefs = getAvatarInventoryItemReferenceIds(item);
            return referenceIds.some((referenceId) => itemRefs.includes(referenceId));
        }) || null;
    }
    if (itemSource && typeof itemSource === 'object') {
        for (const referenceId of referenceIds) {
            if (itemSource[referenceId]) return itemSource[referenceId];
        }
        return Object.values(itemSource).find((item) => {
            const itemRefs = getAvatarInventoryItemReferenceIds(item);
            return referenceIds.some((referenceId) => itemRefs.includes(referenceId));
        }) || null;
    }
    return null;
}

const avatarBodyMotionTimers = new Map();
const avatarBodyMotionTokens = new Map();

function shouldAnimateAvatarIdleBody(prefix, container) {
    if (prefix === 'home-avatar') return true;
    if (!container) return false;
    if (container.dataset.avatarIdle === 'true') return true;
    if (container.dataset.avatarIdle === 'false') return false;
    return container.classList.contains('avatar-combat-actor');
}

function resolveAvatarMotionTarget(target) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element?.id) return { element: null, prefix: '' };
    return { element, prefix: element.id };
}

function getAvatarBodyMotionDefinition(motionName) {
    const key = String(motionName || 'idle').trim();
    return AVATAR_BODY_MOTIONS[key] ? { key, ...AVATAR_BODY_MOTIONS[key] } : { key: 'idle', ...AVATAR_BODY_MOTIONS.idle };
}

function getAvatarBodyFrameIndex(bodyLayer, definition, frameOffset) {
    const sheetColumns = Math.max(1, Number(bodyLayer?.dataset.sheetColumns || 1));
    const row = Math.max(0, Number(definition.row) || 0);
    const count = Math.max(1, Number(definition.count) || 1);
    const col = Math.max(0, Math.min(count - 1, frameOffset));
    return (row * sheetColumns) + col;
}

function applyAvatarBodyMotionFrame(prefix, motionName, frameOffset) {
    const container = document.getElementById(prefix);
    if (!container) return;
    const definition = getAvatarBodyMotionDefinition(motionName);
    const bodyLayer = document.getElementById(`${prefix}-layer-body`);
    const bodyFrameIndex = getAvatarBodyFrameIndex(bodyLayer, definition, frameOffset);
    if (bodyLayer) {
        const spriteWidth = Number(bodyLayer.dataset.spriteWidth || 32);
        const spriteHeight = Number(bodyLayer.dataset.spriteHeight || 32);
        const sheetColumns = Number(bodyLayer.dataset.sheetColumns || 1);
        const scale = Number(bodyLayer.dataset.scale || 2);
        const col = bodyFrameIndex % sheetColumns;
        const row = Math.floor(bodyFrameIndex / sheetColumns);
        const posX = -(col * spriteWidth * scale);
        const posY = -(row * spriteHeight * scale);
        bodyLayer.style.backgroundPosition = `${posX}px ${posY}px`;
        bodyLayer.dataset.spriteIndex = String(bodyFrameIndex);
        bodyLayer.dataset.bodyMotion = definition.key;
        bodyLayer.dataset.bodyMotionFrame = String(frameOffset);
    }
    const shiftSequence = Array.isArray(definition.layerShift) ? definition.layerShift : [];
    const shiftDown = Number(shiftSequence[frameOffset % Math.max(1, shiftSequence.length)] || 0);
    const layers = container.querySelectorAll('.avatar-layer');
    layers.forEach((layer) => {
        if (!layer || layer.id === `${prefix}-layer-body`) return;
        const baseTransform = layer.dataset.baseTransform || 'none';
        const scale = Number(layer.dataset.scale || 2);
        const shiftPx = shiftDown * scale;
        if (shiftPx) {
            layer.style.transform = `${baseTransform === 'none' ? '' : baseTransform} translateY(${shiftPx}px)`.trim();
        } else {
            layer.style.transform = baseTransform;
        }
    });
}

export function stopAvatarBodyMotion(target, options = {}) {
    const { element, prefix } = resolveAvatarMotionTarget(target);
    if (!element || !prefix) return false;
    if (avatarBodyMotionTimers.has(prefix)) {
        clearInterval(avatarBodyMotionTimers.get(prefix));
        avatarBodyMotionTimers.delete(prefix);
    }
    avatarBodyMotionTokens.delete(prefix);
    delete element.dataset.avatarIdleState;
    delete element.dataset.avatarBodyMotion;
    element.dataset.avatarBodyMotionStopped = 'true';
    const bodyLayer = document.getElementById(`${prefix}-layer-body`);
    if (bodyLayer) {
        delete bodyLayer.dataset.bodyMotion;
        delete bodyLayer.dataset.bodyMotionFrame;
    }
    if (options.reset !== false) {
        applyAvatarBodyMotionFrame(prefix, options.resetMotion || 'idle', 0);
    }
    return true;
}

export function startAvatarBodyMotion(target, motionName = 'idle', options = {}) {
    const { element, prefix } = resolveAvatarMotionTarget(target);
    if (!element || !prefix) return false;
    const definition = getAvatarBodyMotionDefinition(motionName);
    stopAvatarBodyMotion(element, { reset: false });
    delete element.dataset.avatarBodyMotionStopped;
    element.dataset.avatarIdleState = 'body';
    element.dataset.avatarBodyMotion = definition.key;
    const intervalMs = Math.max(24, Number(options.intervalMs || definition.intervalMs) || definition.intervalMs);
    const frameCount = Math.max(1, Number(options.frameCount || definition.count) || definition.count);
    const shouldLoop = options.loop !== undefined ? options.loop !== false : definition.loop !== false;
    let frameOffset = 0;
    applyAvatarBodyMotionFrame(prefix, definition.key, frameOffset);
    if (frameCount <= 1) {
        return true;
    }
    const timer = setInterval(() => {
        if (!shouldLoop && frameOffset + 1 >= frameCount) {
            clearInterval(timer);
            avatarBodyMotionTimers.delete(prefix);
            applyAvatarBodyMotionFrame(prefix, definition.key, frameCount - 1);
            return;
        }
        frameOffset = shouldLoop ? (frameOffset + 1) % frameCount : frameOffset + 1;
        applyAvatarBodyMotionFrame(prefix, definition.key, frameOffset);
    }, intervalMs);
    avatarBodyMotionTimers.set(prefix, timer);
    return true;
}

export function playAvatarBodyMotion(target, motionName, options = {}) {
    const { element, prefix } = resolveAvatarMotionTarget(target);
    if (!element || !prefix) return Promise.resolve(false);
    const definition = getAvatarBodyMotionDefinition(motionName);
    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const intervalMs = Math.max(24, Number(options.intervalMs || definition.intervalMs) || definition.intervalMs);
    const frameCount = Math.max(1, Number(options.frameCount || definition.count) || definition.count);
    stopAvatarBodyMotion(element, { reset: false });
    delete element.dataset.avatarBodyMotionStopped;
    avatarBodyMotionTokens.set(prefix, token);
    element.dataset.avatarIdleState = 'body';
    element.dataset.avatarBodyMotion = definition.key;
    applyAvatarBodyMotionFrame(prefix, definition.key, 0);
    return new Promise((resolve) => {
        let frameOffset = 0;
        const finish = (result) => {
            if (avatarBodyMotionTokens.get(prefix) !== token) {
                resolve(false);
                return;
            }
            avatarBodyMotionTokens.delete(prefix);
            if (options.restore !== false) {
                const restoreMotion = options.restoreMotion || (shouldAnimateAvatarIdleBody(prefix, element) ? 'idle' : '');
                if (restoreMotion) startAvatarBodyMotion(element, restoreMotion);
                else stopAvatarBodyMotion(element);
            }
            resolve(result);
        };
        const timer = setInterval(() => {
            if (avatarBodyMotionTokens.get(prefix) !== token) {
                clearInterval(timer);
                avatarBodyMotionTimers.delete(prefix);
                resolve(false);
                return;
            }
            frameOffset += 1;
            if (frameOffset >= frameCount) {
                clearInterval(timer);
                avatarBodyMotionTimers.delete(prefix);
                applyAvatarBodyMotionFrame(prefix, definition.key, frameCount - 1);
                finish(true);
                return;
            }
            applyAvatarBodyMotionFrame(prefix, definition.key, frameOffset);
        }, intervalMs);
        avatarBodyMotionTimers.set(prefix, timer);
    });
}

/**
 * アバターと装備を描画する共通関数
 * @param {string} prefix - 描画対象のDOM IDプレフィックス ('avatar', 'battle-avatar-A', 'battle-avatar-B')
 * @param {object} avatarBase - アバターの素体情報 { Race, AvatarColor, ... }
 * @param {object} equipment - 装備IDのマップ { RightHand, LeftHand, Armor }
 * @param {Array|object} itemSource - アイテム情報のソース (自分のインベントリ配列 or APIから取得したアイテム詳細オブジェクト)
 * @param {boolean} isOpponent - 相手アバター用の特殊処理フラグ (左右反転など)
 */
export function renderAvatar(prefix, avatarBase, equipment, itemSource, isOpponent = false) {
    const avatarContainer = document.getElementById(prefix);
    if (avatarContainer) {
        if (avatarContainer.classList.contains('avatar-combat-actor')) {
            avatarContainer.style.removeProperty('transform');
            if (isOpponent) {
                avatarContainer.style.setProperty('--avatar-facing-scale-x', '-1');
            } else {
                avatarContainer.style.removeProperty('--avatar-facing-scale-x');
            }
        } else if (isOpponent) {
            avatarContainer.style.transform = 'scaleX(-1)';
        } else {
            avatarContainer.style.removeProperty('transform');
        }
    }

    const shouldKeepVisibleWhileLoading = prefix === 'home-avatar';
    const shouldHideUntilReady = !!avatarContainer
        && !shouldKeepVisibleWhileLoading
        && avatarContainer.dataset.avatarReady !== 'true';
    if (shouldHideUntilReady) {
        avatarContainer.style.opacity = '0';
    } else if (shouldKeepVisibleWhileLoading && avatarContainer) {
        avatarContainer.style.opacity = '1';
    }
    let pendingLayers = 0;
    let readyTimer = null;
    const markLayerReady = () => {
        pendingLayers = Math.max(0, pendingLayers - 1);
        if (pendingLayers === 0 && avatarContainer) {
            avatarContainer.dataset.avatarReady = 'true';
            avatarContainer.style.opacity = '1';
            if (readyTimer) {
                clearTimeout(readyTimer);
                readyTimer = null;
            }
        }
    };
    const drawLayer = (layerId, imageUrl, spriteIndex, spriteWidth, spriteHeight, itemCategory, layerAvatarColor = null) => {
        pendingLayers += 1;
        setAvatarPart(layerId, imageUrl, spriteIndex, spriteWidth, spriteHeight, itemCategory, markLayerReady, layerAvatarColor);
    };
    const avatarColor = avatarBase
        ? resolveAvatarBaseSpriteColor(resolveAvatarAssetRace(avatarBase.Race), avatarBase.AvatarColor)
        : (window.myAvatarBaseInfo?.AvatarColor || null);
    const equipmentMap = equipment || {};

    const rightHandItem = getAvatarEquipmentItemDetails(equipmentMap.RightHand, itemSource);
    const isTwoHanded = isTwoHandedAvatarWeapon(rightHandItem);

    // 1. 素体の描画
    if (avatarBase) {
        const {
            Race,
            AvatarColor,
            SkinColorIndex,
            FaceIndex,
            HairStyleIndex,
            HairColorIndex,
            FacialHairStyleIndex,
            level
        } = avatarBase;
        const race = resolveAvatarAssetRace(Race);
        const color = resolveAvatarBaseSpriteColor(race, AvatarColor);
        const hairColor = resolveAvatarHairSpriteColor(HairColorIndex, color);
        const skinIndex = SkinColorIndex || 1;
        const faceIdx = (FaceIndex || 1) - 1;
        let hairIdx = (level >= FEATURE_UNLOCK_LEVELS.hairVisible && HairStyleIndex) ? (HairStyleIndex - 1) : -1;
        const facialHairStyle = Number(FacialHairStyleIndex);
        const facialHairIdx = (
            level >= FEATURE_UNLOCK_LEVELS.facialHairVisible
            && Number.isFinite(facialHairStyle)
            && facialHairStyle > 0
        ) ? (Math.floor(facialHairStyle) - 1) : -1;

        drawLayer(`${prefix}-layer-body`, `./Sprites/Characters/body/body_${color}.png`, 0, 32, 32);
        drawLayer(`${prefix}-layer-head`, `./Sprites/Characters/${race}/head/${race}_head_skin_${skinIndex}.png`, faceIdx, 32, 32);
        drawLayer(`${prefix}-layer-facial-hair`, `./Sprites/Characters/${race}/hair/facial hair/${race}_facialhair_${hairColor}.png`, facialHairIdx, 32, 32);
        drawLayer(`${prefix}-layer-hair`, `./Sprites/Characters/${race}/hair/hairstyle/${race}_hair_${hairColor}.png`, hairIdx, 32, 32);
        drawLayer(`${prefix}-layer-hand-right`, `./Sprites/Characters/${race}/hand/${race}_hand.png`, skinIndex - 1, 16, 16);
        drawLayer(`${prefix}-layer-hand-left`, `./Sprites/Characters/${race}/hand/${race}_hand.png`, skinIndex - 1, 16, 16, isTwoHanded ? 'TwoHandedGrip' : null);
    }

    // 2. 装備品の描画
    const leftHandItem = isTwoHanded ? null : getAvatarEquipmentItemDetails(equipmentMap.LeftHand, itemSource);
    const armorItem = getAvatarEquipmentItemDetails(equipmentMap.Armor, itemSource);
    const accessoryItem = getAvatarEquipmentItemDetails(equipmentMap.Accessory, itemSource);

    // Opponent facing is handled by flipping the whole avatar container.
    // Keep equipment on its original hand, otherwise the flip is applied twice.
    const finalRightHandItem = rightHandItem;
    const finalLeftHandItem = leftHandItem;

    const drawItem = (layer, item) => {
        if (item?.customData) {
            const cd = item.customData;
            const spriteMeta = getAvatarItemSpriteMeta(item);
            drawLayer(`${prefix}-layer-${layer}`, spriteMeta.path, spriteMeta.index, spriteMeta.width, spriteMeta.height, cd.Category, avatarColor);
        } else {
            drawLayer(`${prefix}-layer-${layer}`, null, -1);
        }
    };

    drawItem('weapon-right', finalRightHandItem);
    drawItem('shield-left', finalLeftHandItem);
    drawItem('armor', armorItem);

    if (avatarContainer && shouldHideUntilReady) {
        readyTimer = setTimeout(() => {
            if (avatarContainer.dataset.avatarReady === 'true') return;
            const stuckLayers = Array.from(avatarContainer.querySelectorAll('.avatar-layer'))
                .filter(layer => layer.dataset.loadState === 'loading')
                .map(layer => layer.id);
            if (stuckLayers.length) {
                console.warn('[renderAvatar] layer load timeout:', stuckLayers);
            } else {
                console.warn('[renderAvatar] avatar load timeout: pending layers', pendingLayers);
            }
            avatarContainer.dataset.avatarReady = 'true';
            avatarContainer.style.opacity = '1';
        }, 1200);
    }

    if (pendingLayers === 0 && avatarContainer) {
        avatarContainer.dataset.avatarReady = 'true';
        avatarContainer.style.opacity = '1';
    }

    if (shouldAnimateAvatarIdleBody(prefix, avatarContainer)) {
        startAvatarBodyMotion(avatarContainer, 'idle');
    } else {
        stopAvatarBodyMotion(avatarContainer);
    }

    // 4. ホーム画面の装備名表示を更新（洗練されたUI対応）
    if (prefix === 'avatar') {
        const updateEquipmentSlot = (slotId, statsId, artId, item, slot, slotElement) => {
            const nameEl = document.getElementById(slotId);
            const statsEl = document.getElementById(statsId);
            const slotContainer = slotElement || document.querySelector(`[data-slot="${slot.toLowerCase()}"]`);

            if (!nameEl) return;
            renderEquipmentSlotArt(artId, item, avatarColor);

            if (item) {
                // 装備名を表示
                nameEl.textContent = item.name;

                // ステータス表示
                if (statsEl) {
                    const stats = [];
                    const cd = item.customData;

                    // 攻撃力
                    const atkValue = cd ? (cd.Atk ?? cd.Power) : null;
                    if (atkValue && parseInt(atkValue) > 0) {
                        stats.push(`<span class="stat-atk">\u653b\u6483 +${atkValue}</span>`);
                    }

                    // 防御力
                    const defValue = cd ? (cd.Def ?? cd.Defense) : null;
                    if (defValue && parseInt(defValue) > 0) {
                        stats.push(`<span class="stat-def">\u9632\u5fa1 +${defValue}</span>`);
                    }
                    const magicValue = cd ? (cd.MagicPower ?? cd.Int ?? cd.Intelligence) : null;
                    if (stats.length < 2 && magicValue && parseInt(magicValue) > 0) {
                        stats.push(`<span class="stat-def">\u8853\u88dc +${magicValue}</span>`);
                    }
                    if (stats.length === 0) {
                        const tarotMeta = buildTarotCardMeta(cd);
                        const fallbackLine = tarotMeta[0];
                        if (fallbackLine) {
                            stats.push(`<span>${fallbackLine}</span>`);
                        }
                    }

                    statsEl.innerHTML = stats.join('');
                }

                // スロットに装備済みクラスを追加
                if (slotContainer) {
                    slotContainer.classList.add('equipped');
                }
            } else {
                // 未装備状態
                nameEl.textContent = '未装備';
                if (statsEl) {
                    statsEl.innerHTML = '';
                }
                if (slotContainer) {
                    slotContainer.classList.remove('equipped');
                }
            }
        };

        // 各スロットを更新
        updateEquipmentSlot('equippedRightHand', 'equippedRightHandStats', 'equippedRightHandArt', rightHandItem, 'RightHand',
            document.querySelector('.weapon-slot'));
        updateEquipmentSlot('equippedLeftHand', 'equippedLeftHandStats', 'equippedLeftHandArt', leftHandItem, 'LeftHand',
            document.querySelector('.shield-slot'));
        updateEquipmentSlot('equippedArmor', 'equippedArmorStats', 'equippedArmorArt', armorItem, 'Armor',
            document.querySelector('.armor-slot'));
        updateEquipmentSlot('equippedAccessory', 'equippedAccessoryStats', 'equippedAccessoryArt', accessoryItem, 'Accessory',
            document.querySelector('.accessory-slot'));
        // 両手持ち武器の場合、左手スロットをクリア
        if (isTwoHanded) {
            const leftHandEl = document.getElementById('equippedLeftHand');
            const leftHandStatsEl = document.getElementById('equippedLeftHandStats');
            const leftHandSlot = document.querySelector('.shield-slot');

            if (leftHandEl) leftHandEl.textContent = '両手持ち';
            if (leftHandStatsEl) leftHandStatsEl.innerHTML = '';
            if (leftHandSlot) leftHandSlot.classList.remove('equipped');
            renderEquipmentSlotArt('equippedLeftHandArt', null, avatarColor);
        }
    }
}

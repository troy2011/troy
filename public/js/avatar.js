// c:/Users/ikeda/my-liff-app/public/js/avatar.js

import { AVATAR_PART_OFFSETS } from './config.js';

const spritePromiseCache = new Map();

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

/**
 * アバターの各パーツ（レイヤー）のスタイルを設定して描画する
 * @param {string} layerId - 操作対象のDOM要素ID
 * @param {string} imageUrl - スプライトシートのURL
 * @param {number} spriteIndex - スプライトシート内のインデックス
 * @param {number} spriteWidth - 1フレームの幅
 * @param {number} spriteHeight - 1フレームの高さ
 * @param {string} itemCategory - アイテムのカテゴリ（武器、盾など）
 */
function setAvatarPart(layerId, imageUrl, spriteIndex, spriteWidth = 32, spriteHeight = 32, itemCategory = null, onReady = null) {
    const layer = document.getElementById(layerId);
    if (!layer) {
        if (typeof onReady === 'function') onReady();
        return;
    }
    layer.dataset.loadState = 'loading';

    if (!imageUrl || spriteIndex < 0) {
        layer.style.backgroundImage = 'none';
        layer.dataset.spriteWidth = '';
        layer.dataset.spriteHeight = '';
        layer.dataset.sheetColumns = '';
        layer.dataset.scale = '';
        layer.dataset.spriteIndex = '';
        layer.dataset.baseTransform = '';
        layer.dataset.loadState = 'ready';
        if (typeof onReady === 'function') onReady();
        return;
    }

    loadSpriteImage(imageUrl).then((img) => {
        if (!img) {
            layer.style.backgroundImage = 'none';
            layer.dataset.loadState = 'error';
            if (typeof onReady === 'function') onReady();
            return;
        }
        layer.style.backgroundImage = `url('${imageUrl}')`;
        const scale = 2; // アバターの表示倍率
        layer.style.width = `${spriteWidth * scale}px`;
        layer.style.height = `${spriteHeight * scale}px`;

        // 縦長の画像の場合、上にはみ出すように調整
        layer.style.top = (spriteHeight > 32) ? `-${(spriteHeight - 32) * scale}px` : '0px';

        // パーツごとの位置オフセットを適用
        let transformValue = '';
        if (layerId.includes('layer-armor')) {
            transformValue += ` translateY(${AVATAR_PART_OFFSETS.armor.y}px)`;
        } else if (layerId.includes('hand-right')) {
            transformValue += ` translateX(${AVATAR_PART_OFFSETS.handRight.x}px) translateY(${AVATAR_PART_OFFSETS.handRight.y}px)`;
        } else if (layerId.includes('hand-left')) {
            // 両手持ち武器を装備しているかどうかの判定は renderAvatar で行うため、ここでは単純なオフセットを適用
            transformValue += ` translateX(${AVATAR_PART_OFFSETS.handLeft.x}px) translateY(${AVATAR_PART_OFFSETS.handLeft.y}px)`;
        } else if (layerId.includes('weapon-right')) {
            let offsetX = AVATAR_PART_OFFSETS.rightHandItem.x;
            let offsetY = AVATAR_PART_OFFSETS.rightHandItem.y;
            if (itemCategory === 'Shield') {
                offsetX += AVATAR_PART_OFFSETS.shield.x;
                offsetY += AVATAR_PART_OFFSETS.shield.y;
            }
            if (itemCategory === 'Weapon' && spriteHeight > 32) {
                offsetY += AVATAR_PART_OFFSETS.tallWeapon.y;
            }
            transformValue += ` translateX(${offsetX}px) translateY(${offsetY}px)`;
        } else if (layerId.includes('shield-left')) {
            let offsetX = AVATAR_PART_OFFSETS.leftHandItem.x;
            let offsetY = AVATAR_PART_OFFSETS.leftHandItem.y;
            if (itemCategory === 'Shield') {
                offsetX += AVATAR_PART_OFFSETS.shield.x;
                offsetY += AVATAR_PART_OFFSETS.shield.y;
            }
            transformValue += ` translateX(${offsetX}px) translateY(${offsetY}px)`;
        }

        const baseTransform = transformValue.trim() || 'none';
        layer.style.transform = baseTransform;
        layer.dataset.baseTransform = baseTransform;

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
}

export function preloadAvatarBaseSprites(avatarBase) {
    if (!avatarBase) return;
    const { Race, AvatarColor, SkinColorIndex, FaceIndex, HairStyleIndex, level } = avatarBase;
    const race = (Race || 'human').toLowerCase();
    const color = AvatarColor || 'brown';
    const skinIndex = SkinColorIndex || 1;
    const faceIdx = (FaceIndex || 1) - 1;
    const hairIdx = (level > 1 && HairStyleIndex) ? (HairStyleIndex - 1) : -1;
    const bodyUrl = `./Sprites/Characters/body/body_${color}.png`;
    const headUrl = `./Sprites/Characters/${race}/head/${race}_head_skin_${skinIndex}.png`;
    const hairUrl = hairIdx >= 0 ? `./Sprites/Characters/${race}/hair/hairstyle/${race}_hair_${color}.png` : null;
    const handUrl = `./Sprites/Characters/${race}/hand/${race}_hand.png`;
    loadSpriteImage(bodyUrl);
    loadSpriteImage(headUrl);
    if (hairUrl) loadSpriteImage(hairUrl);
    loadSpriteImage(handUrl);
}

export function preloadEquipmentSprites(equipment, itemSource) {
    if (!equipment) return;
    const getItemDetails = (id) => {
        if (!id) return null;
        if (Array.isArray(itemSource)) {
            return itemSource.find(i =>
                (i.instances && i.instances.includes(id)) || i.itemId === id
            );
        }
        if (itemSource && typeof itemSource === 'object') {
            return itemSource[id];
        }
        return null;
    };
    const items = [
        getItemDetails(equipment.RightHand),
        getItemDetails(equipment.LeftHand),
        getItemDetails(equipment.Armor)
    ].filter(Boolean);
    items.forEach((item) => {
        const path = item?.customData?.sprite_path;
        if (path) loadSpriteImage(path);
    });
}

const homeAvatarTimers = new Map();
const HOME_AVATAR_FRAMES = [0, 1, 2, 3];

function applyHomeAvatarFrame(prefix, frameIndex) {
    const container = document.getElementById(prefix);
    if (!container) return;
    const bodyLayer = document.getElementById(`${prefix}-layer-body`);
    if (bodyLayer) {
        const spriteWidth = Number(bodyLayer.dataset.spriteWidth || 32);
        const spriteHeight = Number(bodyLayer.dataset.spriteHeight || 32);
        const sheetColumns = Number(bodyLayer.dataset.sheetColumns || 1);
        const scale = Number(bodyLayer.dataset.scale || 2);
        const col = frameIndex % sheetColumns;
        const row = Math.floor(frameIndex / sheetColumns);
        const posX = -(col * spriteWidth * scale);
        const posY = -(row * spriteHeight * scale);
        bodyLayer.style.backgroundPosition = `${posX}px ${posY}px`;
        bodyLayer.dataset.spriteIndex = String(frameIndex);
    }
    let shiftDown = 0;
    if (frameIndex === 1) shiftDown = 1;
    else if (frameIndex === 2) shiftDown = 2;
    else if (frameIndex === 3) shiftDown = 1;
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

function startHomeAvatarAnimation(prefix) {
    if (homeAvatarTimers.has(prefix)) {
        clearInterval(homeAvatarTimers.get(prefix));
        homeAvatarTimers.delete(prefix);
    }
    let frameIndex = 0;
    applyHomeAvatarFrame(prefix, HOME_AVATAR_FRAMES[frameIndex]);
    const timer = setInterval(() => {
        frameIndex = (frameIndex + 1) % HOME_AVATAR_FRAMES.length;
        applyHomeAvatarFrame(prefix, HOME_AVATAR_FRAMES[frameIndex]);
    }, 500);
    homeAvatarTimers.set(prefix, timer);
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
        if (isOpponent) {
            avatarContainer.style.transform = 'scaleX(-1)';
        } else {
            avatarContainer.style.removeProperty('transform');
        }
    }

    const shouldHideUntilReady = !!avatarContainer && avatarContainer.dataset.avatarReady !== 'true';
    if (shouldHideUntilReady) {
        avatarContainer.style.opacity = '0';
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
    const drawLayer = (layerId, imageUrl, spriteIndex, spriteWidth, spriteHeight, itemCategory) => {
        pendingLayers += 1;
        setAvatarPart(layerId, imageUrl, spriteIndex, spriteWidth, spriteHeight, itemCategory, markLayerReady);
    };

    // 1. 素体の描画
    if (avatarBase) {
        const { Race, AvatarColor, SkinColorIndex, FaceIndex, HairStyleIndex, level } = avatarBase;
        const race = (Race || 'human').toLowerCase();
        const color = AvatarColor || 'brown';
        const skinIndex = SkinColorIndex || 1;
        const faceIdx = (FaceIndex || 1) - 1;
        let hairIdx = (level > 1 && HairStyleIndex) ? (HairStyleIndex - 1) : -1;

        drawLayer(`${prefix}-layer-body`, `./Sprites/Characters/body/body_${color}.png`, 0, 32, 32);
        drawLayer(`${prefix}-layer-head`, `./Sprites/Characters/${race}/head/${race}_head_skin_${skinIndex}.png`, faceIdx, 32, 32);
        drawLayer(`${prefix}-layer-hair`, `./Sprites/Characters/${race}/hair/hairstyle/${race}_hair_${color}.png`, hairIdx, 32, 32);
        drawLayer(`${prefix}-layer-hand-right`, `./Sprites/Characters/${race}/hand/${race}_hand.png`, skinIndex - 1, 16, 16);
        drawLayer(`${prefix}-layer-hand-left`, `./Sprites/Characters/${race}/hand/${race}_hand.png`, skinIndex - 1, 16, 16);
    }

    // 2. アイテム詳細を取得するヘルパー
    const getItemDetails = (id) => {
        if (!id) return null;
        if (Array.isArray(itemSource)) {
            return itemSource.find(i =>
                (i.instances && i.instances.includes(id)) || i.itemId === id
            );
        }
        return itemSource[id];
    };

    // 3. 装備品の描画
    const rightHandItem = getItemDetails(equipment.RightHand);
    const isTwoHanded = rightHandItem?.customData && (parseInt(rightHandItem.customData.sprite_w, 10) > 32 || parseInt(rightHandItem.customData.sprite_h, 10) > 32);
    const leftHandItem = isTwoHanded ? null : getItemDetails(equipment.LeftHand);
    const armorItem = getItemDetails(equipment.Armor);

    // 相手の場合は左右のアイテムを入れ替えて表示
    const finalRightHandItem = isOpponent ? leftHandItem : rightHandItem;
    const finalLeftHandItem = isOpponent ? rightHandItem : leftHandItem;

    const drawItem = (layer, item) => {
        if (item?.customData) {
            const cd = item.customData;
            drawLayer(`${prefix}-layer-${layer}`, cd.sprite_path, parseInt(cd.sprite_index) || 0, parseInt(cd.sprite_w) || 32, parseInt(cd.sprite_h) || 32, cd.Category);
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

    if (prefix === 'home-avatar') {
        startHomeAvatarAnimation(prefix);
    }

    // 4. ホーム画面の装備名表示を更新（洗練されたUI対応）
    if (prefix === 'avatar') {
        const updateEquipmentSlot = (slotId, statsId, item, slot, slotElement) => {
            const nameEl = document.getElementById(slotId);
            const statsEl = document.getElementById(statsId);
            const slotContainer = slotElement || document.querySelector(`[data-slot="${slot.toLowerCase()}"]`);

            if (!nameEl) return;

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
        updateEquipmentSlot('equippedRightHand', 'equippedRightHandStats', rightHandItem, 'RightHand',
            document.querySelector('.weapon-slot'));
        updateEquipmentSlot('equippedLeftHand', 'equippedLeftHandStats', leftHandItem, 'LeftHand',
            document.querySelector('.shield-slot'));
        updateEquipmentSlot('equippedArmor', 'equippedArmorStats', armorItem, 'Armor',
            document.querySelector('.armor-slot'));

        // 両手持ち武器の場合、左手スロットをクリア
        if (isTwoHanded) {
            const leftHandEl = document.getElementById('equippedLeftHand');
            const leftHandStatsEl = document.getElementById('equippedLeftHandStats');
            const leftHandSlot = document.querySelector('.shield-slot');

            if (leftHandEl) leftHandEl.textContent = '両手持ち';
            if (leftHandStatsEl) leftHandStatsEl.innerHTML = '';
            if (leftHandSlot) leftHandSlot.classList.remove('equipped');
        }
    }
}

// c:/Users/ikeda/my-liff-app/public/js/avatar.js

import { AVATAR_PART_OFFSETS } from './config.js';
import { TAROT_MAJOR_SLOT, buildTarotCardMeta, buildTarotLoadoutEntry } from './tarotCards.js';
import { summarizeTarotLoadoutRole } from './tarotRoles.js';

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

function normalizeAvatarColor(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const aliasMap = {
        fire: 'red',
        water: 'blue',
        wind: 'green',
        earth: 'yellow'
    };
    return aliasMap[raw] || raw;
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
    if (!resolved || resolved === spritePath) return [spritePath];
    return [resolved, spritePath];
}

function setTarotLoadoutSprite(element, sprite) {
    if (!element) return;
    if (!sprite?.path) {
        delete element.dataset.tarotSpriteKey;
        element.style.backgroundImage = 'none';
        element.style.backgroundSize = '';
        element.style.backgroundPosition = '';
        element.style.backgroundRepeat = '';
        element.textContent = '🂠';
        return;
    }
    const width = Number(sprite.width || 48) || 48;
    const height = Number(sprite.height || 80) || 80;
    const index = Math.max(0, Number(sprite.index || 0) || 0);
    const requestedCols = Math.max(1, Number(sprite.cols || 10) || 10);
    const spriteKey = [sprite.path, index, width, height, requestedCols].join('|');
    element.dataset.tarotSpriteKey = spriteKey;
    element.textContent = '';
    loadSpriteImage(sprite.path).then((img) => {
        if (!img || element.dataset.tarotSpriteKey !== spriteKey) return;
        const targetWidth = element.clientWidth || 72;
        const targetHeight = element.clientHeight || 120;
        const scale = Math.min(targetWidth / width, targetHeight / height);
        const sheetColumns = Math.max(1, requestedCols || Math.floor(img.width / width) || 1);
        const col = index % sheetColumns;
        const row = Math.floor(index / sheetColumns);
        const offsetX = ((targetWidth - (width * scale)) / 2) - (col * width * scale);
        const offsetY = ((targetHeight - (height * scale)) / 2) - (row * height * scale);
        element.style.backgroundImage = `url('${sprite.path}')`;
        element.style.backgroundRepeat = 'no-repeat';
        element.style.backgroundSize = `${img.width * scale}px ${img.height * scale}px`;
        element.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
    });
}

function renderTarotLoadoutGrid(majorArcanaItem, manifestationItems) {
    const grid = document.getElementById('tarotLoadoutGrid');
    const summary = document.getElementById('tarotLoadoutRole');
    if (!grid) return;
    const entries = [
        buildTarotLoadoutEntry(TAROT_MAJOR_SLOT, majorArcanaItem),
        ...manifestationItems.map(({ slot, item }) => buildTarotLoadoutEntry(slot, item))
    ];
    const role = summarizeTarotLoadoutRole(entries);
    if (summary) {
        summary.className = `tarot-loadout-role${role?.strength > 0 ? ' is-active' : ''}`;
        summary.innerHTML = `
            <div class="tarot-loadout-role-label">現在の役</div>
            <div class="tarot-loadout-role-main">${role?.label || '未成立'}</div>
            <div class="tarot-loadout-role-bonus">${role?.bonusText || '役ボーナスなし'}</div>
            <div class="tarot-loadout-role-hint">${role?.hint || '5枚の札が揃うと役判定されます。'}</div>
        `;
    }
    grid.innerHTML = '';
    entries.forEach((entry) => {
        const card = document.createElement('div');
        card.className = `tarot-loadout-card${entry.isEmpty ? ' is-empty' : ''}${entry.isArcana ? ' is-arcana' : ''}`;
        card.dataset.suit = entry.suitKey || 'none';

        const slotEl = document.createElement('div');
        slotEl.className = 'tarot-loadout-slot';
        slotEl.textContent = entry.slotLabel;

        const suitEl = document.createElement('div');
        suitEl.className = 'tarot-loadout-suit';
        suitEl.textContent = entry.suitLabel || '無属性';

        const visualEl = document.createElement('div');
        visualEl.className = 'tarot-loadout-visual';
        setTarotLoadoutSprite(visualEl, entry.sprite);

        const numberEl = document.createElement('div');
        numberEl.className = 'tarot-loadout-number';
        numberEl.textContent = entry.numberLabel || '';
        visualEl.appendChild(numberEl);

        const titleEl = document.createElement('div');
        titleEl.className = 'tarot-loadout-title';
        titleEl.textContent = entry.title;

        const detailEl = document.createElement('div');
        detailEl.className = 'tarot-loadout-detail';
        detailEl.textContent = entry.detail;

        card.append(slotEl, suitEl, visualEl, titleEl, detailEl);
        grid.appendChild(card);
    });
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
                layer.dataset.loadState = 'error';
                if (typeof onReady === 'function') onReady();
                return;
            }
            layer.style.backgroundImage = `url('${currentUrl}')`;
            const scale = 2; // アバターの表示倍率
            layer.style.width = `${spriteWidth * scale}px`;
            layer.style.height = `${spriteHeight * scale}px`;

            // 縦長スプライトは部位ごとに少し上へ逃がすが、全量を持ち上げると
            // 下端が切れやすいので、補正量は控えめにして見切れを防ぐ。
            const overflowHeight = Math.max(0, spriteHeight - 32) * scale;
            let topOffset = 0;
            if (overflowHeight > 0) {
                if (layerId.includes('weapon-right') || layerId.includes('shield-left')) {
                    topOffset = -Math.round(overflowHeight * 0.55);
                } else if (layerId.includes('layer-armor')) {
                    topOffset = -Math.round(overflowHeight * 0.4);
                } else {
                    topOffset = -Math.round(overflowHeight * 0.5);
                }
            }
            layer.style.top = `${topOffset}px`;

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
    };

    tryApplyImage(0);
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

export function preloadEquipmentSprites(equipment, itemSource, avatarColor = null) {
    if (!equipment) return;
    const getItemDetails = (id) => {
        if (!id) return null;
        if (typeof id === 'object' && id.customData) return id;
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
        getItemDetails(equipment.Armor),
        getItemDetails(equipment.Accessory)
    ].filter(Boolean);
    items.forEach((item) => {
        const path = item?.customData?.sprite_path;
        const category = item?.customData?.Category || null;
        const resolvedPath = resolveSpritePathByAvatarColor(path, category, avatarColor);
        if (resolvedPath) loadSpriteImage(resolvedPath);
        if (path && resolvedPath && path !== resolvedPath) loadSpriteImage(path);
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
    const drawLayer = (layerId, imageUrl, spriteIndex, spriteWidth, spriteHeight, itemCategory, layerAvatarColor = null) => {
        pendingLayers += 1;
        setAvatarPart(layerId, imageUrl, spriteIndex, spriteWidth, spriteHeight, itemCategory, markLayerReady, layerAvatarColor);
    };
    const avatarColor = avatarBase?.AvatarColor || window.myAvatarBaseInfo?.AvatarColor || null;

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
        if (typeof id === 'object' && id.customData) return id;
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
    const accessoryItem = getItemDetails(equipment.Accessory);
    const majorArcanaItem = getItemDetails(equipment.MajorArcana);

    // 相手の場合は左右のアイテムを入れ替えて表示
    const finalRightHandItem = isOpponent ? leftHandItem : rightHandItem;
    const finalLeftHandItem = isOpponent ? rightHandItem : leftHandItem;

    const drawItem = (layer, item) => {
        if (item?.customData) {
            const cd = item.customData;
            drawLayer(`${prefix}-layer-${layer}`, cd.sprite_path, parseInt(cd.sprite_index) || 0, parseInt(cd.sprite_w) || 32, parseInt(cd.sprite_h) || 32, cd.Category, avatarColor);
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
                    const magicValue = cd ? (cd.MagicPower ?? cd.Int ?? cd.Intelligence) : null;
                    if (stats.length < 2 && magicValue && parseInt(magicValue) > 0) {
                        stats.push(`<span class="stat-def">\u8853\u88dc +${magicValue}</span>`);
                    }
                    if (stats.length === 0) {
                        const tarotMeta = buildTarotCardMeta(cd);
                        const fallbackLine = slot === 'MajorArcana'
                            ? (tarotMeta[1] || tarotMeta[0])
                            : (cd?.SourceCardName ? `札: ${cd.SourceCardName}` : tarotMeta[0]);
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
        updateEquipmentSlot('equippedRightHand', 'equippedRightHandStats', rightHandItem, 'RightHand',
            document.querySelector('.weapon-slot'));
        updateEquipmentSlot('equippedLeftHand', 'equippedLeftHandStats', leftHandItem, 'LeftHand',
            document.querySelector('.shield-slot'));
        updateEquipmentSlot('equippedArmor', 'equippedArmorStats', armorItem, 'Armor',
            document.querySelector('.armor-slot'));
        updateEquipmentSlot('equippedAccessory', 'equippedAccessoryStats', accessoryItem, 'Accessory',
            document.querySelector('.accessory-slot'));
        updateEquipmentSlot('equippedMajorArcana', 'equippedMajorArcanaStats', majorArcanaItem, 'MajorArcana',
            document.querySelector('.major-arcana-slot'));
        renderTarotLoadoutGrid(majorArcanaItem, [
            { slot: 'Armor', item: armorItem },
            { slot: 'RightHand', item: rightHandItem },
            { slot: 'LeftHand', item: leftHandItem },
            { slot: 'Accessory', item: accessoryItem }
        ]);

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

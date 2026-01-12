// c:/Users/ikeda/my-liff-app/public/js/avatar.js

import { AVATAR_PART_OFFSETS } from './config.js';

/**
 * アバターの各パーツ（レイヤー）のスタイルを設定して描画する
 * @param {string} layerId - 操作対象のDOM要素ID
 * @param {string} imageUrl - スプライトシートのURL
 * @param {number} spriteIndex - スプライトシート内のインデックス
 * @param {number} spriteWidth - 1フレームの幅
 * @param {number} spriteHeight - 1フレームの高さ
 * @param {string} itemCategory - アイテムのカテゴリ（武器、盾など）
 */
function setAvatarPart(layerId, imageUrl, spriteIndex, spriteWidth = 32, spriteHeight = 32, itemCategory = null) {
    const layer = document.getElementById(layerId);
    if (!layer) return;

    if (!imageUrl || spriteIndex < 0) {
        layer.style.backgroundImage = 'none';
        return;
    }

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
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

        layer.style.transform = transformValue.trim() || 'none';

        // スプライトシートの表示位置を計算
        const sheetColumns = Math.floor(img.width / spriteWidth);
        layer.style.backgroundSize = `${img.width * scale}px ${img.height * scale}px`;
        const col = spriteIndex % sheetColumns;
        const row = Math.floor(spriteIndex / sheetColumns);
        const posX = -(col * spriteWidth * scale);
        const posY = -(row * spriteHeight * scale);
        layer.style.backgroundPosition = `${posX}px ${posY}px`;
    };
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

    // 1. 素体の描画
    if (avatarBase) {
        const { Race, AvatarColor, SkinColorIndex, FaceIndex, HairStyleIndex, level } = avatarBase;
        const race = (Race || 'human').toLowerCase();
        const color = AvatarColor || 'brown';
        const skinIndex = SkinColorIndex || 1;
        const faceIdx = (FaceIndex || 1) - 1;
        let hairIdx = (level > 1 && HairStyleIndex) ? (HairStyleIndex - 1) : -1;

        setAvatarPart(`${prefix}-layer-body`, `./Sprites/Characters/body/body_${color}.png`, 0, 32, 32);
        setAvatarPart(`${prefix}-layer-head`, `./Sprites/Characters/${race}/head/${race}_head_skin_${skinIndex}.png`, faceIdx, 32, 32);
        setAvatarPart(`${prefix}-layer-hair`, `./Sprites/Characters/${race}/hair/hairstyle/${race}_hair_${color}.png`, hairIdx, 32, 32);
        setAvatarPart(`${prefix}-layer-hand-right`, `./Sprites/Characters/${race}/hand/${race}_hand.png`, skinIndex - 1, 16, 16);
        setAvatarPart(`${prefix}-layer-hand-left`, `./Sprites/Characters/${race}/hand/${race}_hand.png`, skinIndex - 1, 16, 16);
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
            setAvatarPart(`${prefix}-layer-${layer}`, cd.sprite_path, parseInt(cd.sprite_index) || 0, parseInt(cd.sprite_w) || 32, parseInt(cd.sprite_h) || 32, cd.Category);
        } else {
            setAvatarPart(`${prefix}-layer-${layer}`, null, -1);
        }
    };

    drawItem('weapon-right', finalRightHandItem);
    drawItem('shield-left', finalLeftHandItem);
    drawItem('armor', armorItem);

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
                        stats.push(`<span class="stat-atk">?? +${atkValue}</span>`);
                    }

                    // 防御力
                    const defValue = cd ? (cd.Def ?? cd.Defense) : null;
                    if (defValue && parseInt(defValue) > 0) {
                        stats.push(`<span class="stat-def">??? +${defValue}</span>`);
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

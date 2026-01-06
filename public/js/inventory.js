// c:/Users/ikeda/my-liff-app/public/js/inventory.js

import { callApiWithLoader } from './playfabClient.js';
import { renderAvatar } from './avatar.js';
import * as Player from './player.js';

let myInventory = [];
let myCurrentEquipment = {};
let myVirtualCurrency = {};

export function getMyInventory() {
    return myInventory;
}

export function getMyCurrentEquipment() {
    return myCurrentEquipment;
}

function renderResourceSummary() {
    const container = document.getElementById('resourceSummaryRows');
    if (!container) return;

    const mapping = [
        { code: 'RR', label: '🔥' },
        { code: 'RG', label: '🪨' },
        { code: 'RY', label: '🍄' },
        { code: 'RB', label: '💧' },
        { code: 'RT', label: '🌿' },
        { code: 'RS', label: '🌳' }
    ];

    container.innerHTML = mapping.map(item => {
        const value = Number(myVirtualCurrency?.[item.code] || 0);
        return `<div class="resource-chip">${item.label}<b>${value}</b></div>`;
    }).join('');
}

export async function getInventory(playFabId) {
    document.getElementById('inventoryGrid').innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">（持ち物を読み込んでいます...）</p>';
    const data = await callApiWithLoader('/api/get-inventory', { playFabId });
    if (data) {
        myInventory = data.inventory;
        myVirtualCurrency = data.virtualCurrency || {};
    }
    await getEquipment(playFabId);
    renderInventoryGrid('All');
    renderResourceSummary();
}

export async function getEquipment(playFabId) {
    const data = await callApiWithLoader('/api/get-equipment', { playFabId });
    if (data?.equipment) {
        myCurrentEquipment = data.equipment;
    }
    updateEquipmentAndAvatarDisplay();
}

export async function equipItem(playFabId, itemId, slot) {
    const data = await callApiWithLoader('/api/equip-item', { playFabId, itemId, slot });
    if (data !== null) {
        await getInventory(playFabId); // インベントリと装備を再取得して表示を更新
        // アイテム詳細モーダルを閉じる
        const modal = document.getElementById('itemDetailModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

export async function useItem(playFabId, itemInstanceId, itemId) {
    const data = await callApiWithLoader('/api/use-item', { playFabId, itemInstanceId, itemId });
    if (data) {
        document.getElementById('pointMessage').innerText = data.message;
        await getInventory(playFabId);
        await Player.getPlayerStats(playFabId);
        // アイテム詳細モーダルを閉じる
        const modal = document.getElementById('itemDetailModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

export async function sellItem(playFabId, itemInstanceId, itemId) {
    const data = await callApiWithLoader('/api/sell-item', { playFabId, itemInstanceId, itemId });
    if (data) {
        await getInventory(playFabId);
        await Player.getPoints(playFabId);
    }
}

export function switchInventoryTab(category) {
    document.querySelectorAll('.inventory-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    renderInventoryGrid(category);
}

export function renderInventoryGrid(category) {
    const gridEl = document.getElementById('inventoryGrid');
    gridEl.innerHTML = '';

    const filtered = (category === 'All')
        ? myInventory
        : myInventory.filter(item => item.customData?.Category === category);

    const sortOrder = document.getElementById('inventorySort').value;
    const sorted = [...filtered].sort((a, b) => {
        if (sortOrder === 'power_desc') {
            return (b.customData?.Power || 0) - (a.customData?.Power || 0);
        }
        if (sortOrder === 'defense_desc') {
            return (b.customData?.Defense || 0) - (a.customData?.Defense || 0);
        }
        return 0; // default
    });

    if (sorted.length === 0) {
        gridEl.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">このカテゴリのアイテムはありません。</p>';
        return;
    }

    sorted.forEach(item => {
        const instanceId = item.instances?.[0];
        if (!instanceId) return;

        const cell = document.createElement('div');
        cell.className = 'inventory-item-cell';
        cell.onclick = () => showItemDetailModal(item);

        const iconDiv = document.createElement('div');
        iconDiv.className = 'inventory-item-icon';
        cell.appendChild(iconDiv);

        const cd = item.customData || {};
        setSpriteIcon(iconDiv, cd.sprite_path, parseInt(cd.sprite_index, 10) || 0, parseInt(cd.sprite_w, 10) || 32, parseInt(cd.sprite_h, 10) || 32);

        if (item.count > 1) {
            const countSpan = document.createElement('span');
            countSpan.className = 'inventory-item-count';
            countSpan.innerText = `x${item.count}`;
            cell.appendChild(countSpan);
        }
        if (Object.values(myCurrentEquipment).includes(instanceId)) {
            const equippedSpan = document.createElement('span');
            equippedSpan.className = 'inventory-item-equipped-mark';
            equippedSpan.innerText = 'E';
            cell.appendChild(equippedSpan);
        }
        gridEl.appendChild(cell);
    });
}

function setSpriteIcon(element, imageUrl, spriteIndex, spriteWidth = 32, spriteHeight = 32, scale = 1) {
    if (!element || !imageUrl || spriteIndex < 0) {
        if (element) element.style.backgroundImage = 'none';
        return;
    }

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
        element.style.backgroundImage = `url('${imageUrl}')`;
        element.style.width = `${spriteWidth * scale}px`;
        element.style.height = `${spriteHeight * scale}px`;
        element.style.backgroundSize = `${img.width * scale}px ${img.height * scale}px`;

        const sheetColumns = Math.floor(img.width / spriteWidth);
        const col = spriteIndex % sheetColumns;
        const row = Math.floor(spriteIndex / sheetColumns);
        const posX = -(col * spriteWidth * scale);
        const posY = -(row * spriteHeight * scale);
        element.style.backgroundPosition = `${posX}px ${posY}px`;
    };
    img.onerror = () => { element.style.backgroundImage = 'none'; };
}

function showItemDetailModal(item) {
    const modal = document.getElementById('itemDetailModal');
    const cd = item.customData || {};
    const instanceId = item.instances?.[0];

    setSpriteIcon(document.getElementById('itemDetailIcon'), cd.sprite_path, parseInt(cd.sprite_index, 10) || 0, parseInt(cd.sprite_w, 10) || 32, parseInt(cd.sprite_h, 10) || 32);
    document.getElementById('itemDetailName').innerText = item.name;
    document.getElementById('itemDetailCategory').innerText = cd.Category || '不明';
    document.getElementById('itemDetailDescription').innerText = item.description || '説明がありません。';

    const statsEl = document.getElementById('itemDetailStats');
    statsEl.innerHTML = '';
    if (cd.Power) statsEl.innerHTML += `<span>攻撃力: <strong>${cd.Power}</strong></span><br>`;
    if (cd.Defense) statsEl.innerHTML += `<span>防御力: <strong>${cd.Defense}</strong></span><br>`;
    if (cd.Effect) statsEl.innerHTML += `<span>効果: <strong>${cd.Effect.Type} ${cd.Effect.Amount}</strong></span>`;

    const buttonsEl = document.getElementById('itemDetailButtons');
    buttonsEl.innerHTML = '';
    const isEquipped = (slot) => myCurrentEquipment[slot] === instanceId;

    if (cd.Category === 'Weapon' || cd.Category === 'Shield') {
        const isTwoHanded = cd.sprite_w > 32 || cd.sprite_h > 32;
        if (isTwoHanded) {
            buttonsEl.innerHTML += isEquipped('RightHand') ? '<button disabled>装備中</button>' : `<button onclick="window.equipItem('${instanceId}', 'RightHand')">両手装備</button>`;
        } else {
            buttonsEl.innerHTML += isEquipped('RightHand') ? '<button disabled>右手</button>' : `<button onclick="window.equipItem('${instanceId}', 'RightHand')">右手</button>`;
            buttonsEl.innerHTML += isEquipped('LeftHand') ? '<button disabled>左手</button>' : `<button onclick="window.equipItem('${instanceId}', 'LeftHand')">左手</button>`;
        }
    } else if (cd.Category === 'Armor') {
        buttonsEl.innerHTML += isEquipped('Armor') ? '<button disabled>装備中</button>' : `<button onclick="window.equipItem('${instanceId}', 'Armor')">装備</button>`;
    } else if (cd.Category === 'Consumable') {
        buttonsEl.innerHTML += `<button class="use-button" onclick="window.useItem('${instanceId}', '${item.itemId}')">つかう</button>`;
    }

    if (cd.SellPrice > 0) {
        buttonsEl.innerHTML += `<button style="background: #a0aec0;" onclick="window.showSellConfirmationModal('${instanceId}', '${item.itemId}')">売る</button>`;
    }

    modal.style.display = 'flex';
}

export function showSellConfirmationModal(itemInstanceId, itemId) {
    const item = myInventory.find(i => i.itemId === itemId);
    if (!item?.customData?.SellPrice) return;

    document.getElementById('sellItemName').innerText = item.name;
    document.getElementById('sellItemPrice').innerText = item.customData.SellPrice;
    const modal = document.getElementById('sellConfirmationModal');
    modal.style.display = 'flex';

    const confirmBtn = document.getElementById('btnConfirmSell');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.onclick = () => {
        modal.style.display = 'none';
        window.sellItem(itemInstanceId, itemId);
    };

    const cancelBtn = document.getElementById('btnCancelSell');
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.onclick = () => { modal.style.display = 'none'; };
}

function updateEquipmentAndAvatarDisplay() {
    // ??E??? getEquipment ??????
    // ??????????? main.js ????????E
    renderAvatar('avatar', window.myAvatarBaseInfo, myCurrentEquipment, myInventory, false);
    renderAvatar('home-avatar', window.myAvatarBaseInfo, myCurrentEquipment, myInventory, false);
    updateEquipmentBonusDisplay();
    renderResourceSummary();
}

function updateEquipmentBonusDisplay() {
    const bonuses = getEquipmentBonuses();
    setBonusValue('currentStrBonus', bonuses.str);
    setBonusValue('currentDefBonus', bonuses.def);
    setBonusValue('currentAgiBonus', bonuses.agi);
    setBonusValue('currentIntBonus', bonuses.int);
}

function setBonusValue(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const displayValue = Number.isFinite(value) ? value : 0;
    el.textContent = `+${displayValue}`;
    el.classList.toggle('is-zero', displayValue === 0);
}

function getEquipmentBonuses() {
    const bonuses = { str: 0, def: 0, agi: 0, int: 0 };
    const equippedIds = Object.values(myCurrentEquipment || {}).filter(Boolean);

    equippedIds.forEach((instanceId) => {
        const item = myInventory.find(i => i.instances && i.instances.includes(instanceId));
        if (!item || !item.customData) return;
        const cd = item.customData;

        const atk = parseInt(cd.Atk ?? cd.Power ?? 0, 10) || 0;
        const def = parseInt(cd.Def ?? cd.Defense ?? 0, 10) || 0;
        const agi = parseInt(cd.Agi ?? cd.Speed ?? 0, 10) || 0;
        const intel = parseInt(cd.Int ?? cd.Intelligence ?? 0, 10) || 0;

        bonuses.str += atk;
        bonuses.def += def;
        bonuses.agi += agi;
        bonuses.int += intel;
    });

    return bonuses;
}

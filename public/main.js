// c:/Users/ikeda/my-liff-app/public/main.js

import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig, RACE_COLORS } from 'config';
import { callApiWithLoader, promisifyPlayFab, buildApiUrl } from 'api';
import { showTab, showConfirmationModal } from 'ui';
import * as Player from 'player';
import * as Inventory from 'inventory';
import * as Guild from './js/guild.js';
import * as Ship from './js/ship.js';
import * as Island from './js/island.js';
import * as NationKing from './js/nationKing.js';
import { initMapChat } from './js/mapChat.js';
import { renderAvatar } from './js/avatar.js';

import { getDatabase } from "firebase/database";
// --- グローバル変数 ---
window.myLineProfile = null;
window.myPlayFabId = null;
window.myAvatarBaseInfo = { Race: 'human', SkinColorIndex: 1, Nation: 'fire' };
window.myEntityToken = null;

const NATION_GROUP_BY_RACE = {
    Human: { island: 'fire', groupName: 'nation_fire_island' },
    Goblin: { island: 'water', groupName: 'nation_water_island' },
    Orc: { island: 'earth', groupName: 'nation_earth_island' },
    Elf: { island: 'wind', groupName: 'nation_wind_island' }
};

const AVATAR_COLOR_BY_NATION = {
    fire: 'red',
    earth: 'green',
    wind: 'purple',
    water: 'blue'
};

function getAvatarColorForNation(nation) {
    const key = String(nation || '').toLowerCase();
    return AVATAR_COLOR_BY_NATION[key] || null;
}

// main.js は export しないため、RACE_COLORS を window に登録
window.RACE_COLORS = RACE_COLORS;

// perf=1 をURLに付けると初期化の所要時間をconsoleに出します
const __perfEnabled = new URLSearchParams(window.location.search).has('perf');
const __perfStart = performance.now();
function __perfLog(label) {
    if (!__perfEnabled) return;
    console.log(`[perf] ${label}: ${Math.round(performance.now() - __perfStart)}ms`);
}

// PlayFab Client SDK の設定
PlayFab.settings.titleId = '1A0BA';

// --- 初期化フロー ---

document.addEventListener('DOMContentLoaded', () => {
    initializeLiff();
});

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const firestore = getFirestore(firebaseApp); // Firestore インスタンス

// グローバルスコープに登録（WorldMapSceneで使用）
window.firestore = firestore;

async function initializeLiff() {
    try {
        __perfLog('initializeLiff start');
        await liff.init({ liffId: "2008427313-jg0DYMVb" });
        __perfLog('liff.init done');
        if (!liff.isLoggedIn()) { liff.login(); return; }

        const profile = await liff.getProfile();
        __perfLog('liff.getProfile done');
        myLineProfile = profile;
        window.myLineProfile = profile; // グローバルスコープにも設定
        document.getElementById('globalPlayerName').innerText = myLineProfile.displayName;

        const loginData = await callApiWithLoader('/api/login-playfab', {
            lineUserId: myLineProfile.userId,
            displayName: myLineProfile.displayName,
            pictureUrl: myLineProfile.pictureUrl
        });
        __perfLog('login-playfab API done');

        if (!loginData) throw new Error('PlayFabログインAPIエラー');
        myPlayFabId = loginData.playFabId;
        window.myPlayFabId = loginData.playFabId; // グローバルスコープにも設定

        // --- PlayFab & Firebase Login ---
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                __perfLog('firebase auth state: user');
                console.log("Firebase authenticated successfully. User UID:", user.uid);

                // PlayFab Client SDKにログイン
                const pfLogin = await promisifyPlayFab(PlayFab.ClientApi.LoginWithCustomID, {
                    CustomId: myLineProfile.userId, CreateAccount: false
                });
                __perfLog('PlayFab ClientApi.LoginWithCustomID done');
                window.myEntityToken = pfLogin?.EntityToken?.EntityToken || PlayFab?._internalSettings?.entityToken || null;

                if (loginData.needsRaceSelection) {
                    document.getElementById('appWrapper').style.display = 'block';
                    showRaceModal();
                } else {
                    await initializeAppFeatures();
                    __perfLog('initializeAppFeatures done');
                    document.getElementById('appWrapper').style.display = 'block';
                    await NationKing.refreshKingNav(myPlayFabId);

                    // Check for help request URL parameters
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.get('action') === 'help') {
                        const islandId = urlParams.get('islandId');
                        if (islandId) {
                            await Island.helpConstruction(islandId, myPlayFabId);
                        }
                    }

                    await showTab('home', { playFabId: myPlayFabId, race: myAvatarBaseInfo.Race || 'human', nation: myAvatarBaseInfo.Nation });
                    __perfLog('showTab(home) done');
                }
            }
        });

        if (loginData.firebaseToken) {
            __perfLog('calling signInWithCustomToken');
            signInWithCustomToken(auth, loginData.firebaseToken).catch(error => {
                console.error("Firebase sign-in failed:", error);
                document.getElementById('appWrapper').style.display = 'block';
                document.getElementById('globalPlayerName').innerText = '認証エラー';
            });
        } else {
            console.warn("Firebase token not provided. Running in limited mode.");
            if (loginData.needsRaceSelection) showRaceModal();
            document.getElementById('appWrapper').style.display = 'block';
        }

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('appWrapper').style.display = 'block';
        document.getElementById('globalPlayerName').innerText = '初期化エラー';
    }
}

async function initializeAppFeatures() {
    console.log('[initializeAppFeatures] Starting initialization...');

    // --- UI event bindings ---
    document.getElementById('btnGetStats').addEventListener('click', () => Player.getPlayerStats(myPlayFabId));
    document.getElementById('btnScanPay').addEventListener('click', startScanAndPay);
    document.querySelectorAll('.transfer-quick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const amount = Number(btn.dataset.amount || 0);
            const input = document.getElementById('transferAmount');
            if (!input || !Number.isFinite(amount)) return;
            if (amount === 0) {
                input.value = '0';
                return;
            }
            const current = Number(input.value || 0);
            input.value = String((Number.isFinite(current) ? current : 0) + amount);
        });
    });

    initMapChat(myPlayFabId);

    document.querySelectorAll('.inventory-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => Inventory.switchInventoryTab(btn.dataset.category));
    });
    document.getElementById('inventorySort').addEventListener('change', () => {
        const currentCategory = document.querySelector('.inventory-tab-btn.active').dataset.category;
        Inventory.renderInventoryGrid(currentCategory);
    });

    // 装備スロットのクリックイベント（インベントリタブに移動してフィルタリング）
    document.querySelectorAll('.equip-slot').forEach(slot => {
        slot.addEventListener('click', async () => {
            const slotType = slot.dataset.slot;
            let targetCategory = 'All';

            // スロットタイプに応じてカテゴリを決定
            if (slotType === 'rightHand') {
                targetCategory = 'Weapon';
            } else if (slotType === 'leftHand') {
                targetCategory = 'Shield';
            } else if (slotType === 'armor') {
                targetCategory = 'Armor';
            }

            // インベントリタブに移動
            await showTab('inventory', { playFabId: myPlayFabId, race: myAvatarBaseInfo.Race, nation: myAvatarBaseInfo.Nation });

            // カテゴリタブを切り替え
            if (targetCategory !== 'All') {
                Inventory.switchInventoryTab(targetCategory);
            }
        });
    });
    document.getElementById('btnGetRanking').addEventListener('click', Player.getRanking);
    document.getElementById('btnShowPsRanking').addEventListener('click', () => Player.showRanking('ps'));
    document.getElementById('btnShowBountyRanking').addEventListener('click', () => Player.showRanking('bounty'));
    document.getElementById('btnCreateGuild').addEventListener('click', () => Guild.showCreateGuildModal());
    document.getElementById('btnConfirmCreateGuild').addEventListener('click', () => {
        const guildName = document.getElementById('guildNameInput').value;
        Guild.createGuild(myPlayFabId, guildName);
    });
    document.getElementById('btnCancelCreateGuild').addEventListener('click', () => {
        document.getElementById('guildCreateModal').style.display = 'none';
    });
    document.getElementById('btnScanJoinGuild').addEventListener('click', () => Guild.scanJoinGuild(myPlayFabId));
    document.getElementById('btnLeaveGuild').addEventListener('click', () => Guild.leaveGuild(myPlayFabId));
    document.getElementById('btnViewGuildMembers').addEventListener('click', () => Guild.showGuildMembers(myPlayFabId));
    document.getElementById('btnViewGuildChat').addEventListener('click', () => Guild.showGuildChat(myPlayFabId));
    document.getElementById('btnViewGuildWarehouse').addEventListener('click', () => Guild.showGuildWarehouse(myPlayFabId));
    document.getElementById('btnViewGuildApplications').addEventListener('click', () => Guild.showGuildApplications(myPlayFabId));
    document.getElementById('btnSendGuildChat').addEventListener('click', () => Guild.sendGuildChatMessage(myPlayFabId));
    document.getElementById('guildChatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') Guild.sendGuildChatMessage(myPlayFabId);
    });

    // 船関連のイベントリスナー
    document.getElementById('btnCreateShip').addEventListener('click', showCreateShipModal);
    document.getElementById('btnConfirmCreateShip').addEventListener('click', () => confirmCreateShip(myPlayFabId));
    document.getElementById('shipTypeSelect').addEventListener('change', updateShipTypeDetails);

    // QRコード生成
    new QRious({ element: document.getElementById('myQrCanvas'), value: myPlayFabId, size: 150 });

    // --- 初期データ取得 ---
    const initPromises = [
        updateAvatarBaseInfo(),
        Inventory.getInventory(myPlayFabId),
        (async () => {
            try {
                console.log('[initializeAppFeatures] Fetching building meta...');
                const response = await fetch(buildApiUrl('/api/get-building-meta'));
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                window.buildingMetaById = await response.json();
                console.log('[initializeAppFeatures] Building meta loaded:', window.buildingMetaById);
            } catch (e) {
                console.error('[initializeAppFeatures] Failed to fetch building meta:', e);
                window.buildingMetaById = {};
            }
        })(),
        (async () => {
            try {
                console.log('[initializeAppFeatures] Fetching ship catalog...');
                const response = await fetch(buildApiUrl('/api/get-ship-catalog'));
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                window.shipCatalog = await response.json();
                console.log('[initializeAppFeatures] Ship catalog loaded:', window.shipCatalog);
            } catch (e) {
                console.error('[initializeAppFeatures] Failed to fetch ship catalog:', e);
                window.shipCatalog = {}; // エラー時も空オブジェクトで初期化
            }
        })()
    ];

    try {
        await Promise.all(initPromises);
    } catch (e) {
        console.warn('[initializeAppFeatures] One or more initialization tasks failed:', e);
    }

    if (typeof window !== 'undefined' && typeof window.initializeBattleSystem === 'function') {
        window.initializeBattleSystem({
            myPlayFabId,
            myCurrentEquipment: Inventory.getMyCurrentEquipment(),
            myInventory: Inventory.getMyInventory(),
            callApiWithLoader,
            renderAvatar,
            getMyCurrentEquipment: Inventory.getMyCurrentEquipment,
            getMyInventory: Inventory.getMyInventory,
            db
        });
    } else {
        console.warn('[initializeAppFeatures] initializeBattleSystem not found');
    }

    console.log('[initializeAppFeatures] Initialization complete (async tasks running).');
}

// --- UI制御系 ---


async function ensureNationGroupForRace(raceName) {
    const mapping = NATION_GROUP_BY_RACE[raceName];
    if (!mapping) throw new Error('Invalid raceName');

    if (!getPlayFabGroupsApi()) {
        await loadPlayFabGroupsSdk();
    }

    const info = await callApiWithLoader('/api/get-nation-group', { raceName }, { isSilent: true });
    if (info && info.groupId) {
        return { groupId: info.groupId, groupName: mapping.groupName };
    }

    const groupsApi = getPlayFabGroupsApi();
    if (!groupsApi) {
        throw new Error('PlayFabGroups SDK not loaded');
    }

    try {
        const created = await promisifyPlayFab(groupsApi.CreateGroup, { GroupName: mapping.groupName });
        const groupId = created?.Group?.Id || null;
        if (!groupId) throw new Error('CreateGroup did not return group id');
        return { groupId, groupName: mapping.groupName };
    } catch (e) {
        const retry = await callApiWithLoader('/api/get-nation-group', { raceName }, { isSilent: true });
        if (retry && retry.groupId) {
            return { groupId: retry.groupId, groupName: mapping.groupName };
        }
        throw e;
    }
}

function getPlayFabGroupsApi() {
    if (typeof PlayFabGroupsSDK !== 'undefined') return PlayFabGroupsSDK;
    if (typeof PlayFab !== 'undefined' && PlayFab.GroupsApi) return PlayFab.GroupsApi;
    return null;
}

let _playFabGroupsLoading = null;
async function loadPlayFabGroupsSdk() {
    if (getPlayFabGroupsApi()) return;
    if (_playFabGroupsLoading) return _playFabGroupsLoading;

    _playFabGroupsLoading = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-playfab-groups]');
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Failed to load PlayFabGroups SDK')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://download.playfab.com/PlayFabGroupsApi.js?ts=' + Date.now();
        script.async = true;
        script.dataset.playfabGroups = '1';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load PlayFabGroups SDK'));
        document.head.appendChild(script);
    });

    return _playFabGroupsLoading;
}

function showRaceModal() {
    document.getElementById('raceModal').style.display = 'flex';
    const nameInput = document.getElementById('raceDisplayNameInput');
    if (nameInput) {
        nameInput.value = window.myLineProfile?.displayName || '';
    }

    const handleRaceSelection = async (event) => {
        if (event.target.tagName !== 'BUTTON') return;
        const raceButtonsContainer = document.getElementById('raceModal').querySelector('div[style*="grid"]');
        raceButtonsContainer.removeEventListener('click', handleRaceSelection);

        const raceName = event.target.dataset.race;
        document.getElementById('raceMessage').innerText = '（初期ステータスを設定中...）';
        const groupInfo = await ensureNationGroupForRace(raceName);
        if (!window.myEntityToken) throw new Error('Entity token not available');
        const displayName = (document.getElementById('raceDisplayNameInput')?.value || '').trim();
        const data = await callApiWithLoader('/api/set-race', {
            playFabId: myPlayFabId,
            raceName: raceName,
            nationGroupId: groupInfo.groupId,
            entityToken: window.myEntityToken,
            displayName: displayName || window.myLineProfile?.displayName || ''
        });
        if (data !== null) {
            document.getElementById('raceModal').style.display = 'none';
            if (displayName) {
                document.getElementById('globalPlayerName').innerText = displayName;
            }
            await initializeAppFeatures();
            await NationKing.refreshKingNav(myPlayFabId);
            const nation = data?.nation?.Nation || data?.nation?.NationIsland || null;
            if (nation) {
                const avatarColor = getAvatarColorForNation(nation);
                if (avatarColor) {
                    myAvatarBaseInfo = {
                        ...myAvatarBaseInfo,
                        Nation: String(nation).toLowerCase(),
                        AvatarColor: avatarColor
                    };
                    window.myAvatarBaseInfo = myAvatarBaseInfo;
                }
            }
            await showTab('home', { playFabId: myPlayFabId, race: raceName.toLowerCase(), nation });
        } else {
            document.getElementById('raceMessage').innerText = 'エラーが発生しました。';
            raceButtonsContainer.addEventListener('click', handleRaceSelection);
        }
    };

    const raceButtonsContainer = document.getElementById('raceModal').querySelector('div[style*="grid"]');
    raceButtonsContainer.addEventListener('click', handleRaceSelection);
}

// --- アバター表示ロジック ---

async function updateAvatarBaseInfo() {
    console.log('[updateAvatarBaseInfo] Fetching user data from PlayFab...');
    const result = await callApiWithLoader(PlayFab.ClientApi.GetUserReadOnlyData, {
        PlayFabId: myPlayFabId,
        Keys: ["Race", "Nation", "AvatarColor", "SkinColorIndex", "FaceIndex", "HairStyleIndex", "HairColorIndex"]
    }, { isSilent: true });

    if (result && result.Data) {
        const nation = (result.Data.Nation?.Value || '').toLowerCase();
        const nationColor = getAvatarColorForNation(nation);
        myAvatarBaseInfo = {
            Race: (result.Data.Race?.Value || 'Human').toLowerCase(),
            Nation: nation,
            AvatarColor: nationColor || result.Data.AvatarColor?.Value || 'brown',
            SkinColorIndex: parseInt(result.Data.SkinColorIndex?.Value, 10) || 1,
            FaceIndex: parseInt(result.Data.FaceIndex?.Value, 10) || 1,
            HairStyleIndex: parseInt(result.Data.HairStyleIndex?.Value, 10) || 1,
        };
        window.myAvatarBaseInfo = myAvatarBaseInfo;
    }
}

// --- 機能別ロジック ---

// 5. その他（ステータス、送金）
async function startScanAndPay() {
    if (!liff.isInClient()) {
        document.getElementById('pointMessage').innerText = 'QRスキャンはLINEアプリ内でのみ利用できます。';
        return;
    }
    try {
        const result = await liff.scanCodeV2();
        if (result && result.value) {
            const amount = parseInt(document.getElementById('transferAmount').value, 10);
            showConfirmationModal(amount, result.value, async () => {
                const data = await callApiWithLoader('/api/transfer-points', { fromId: myPlayFabId, toId: result.value, amount });
                if (data) {
                    document.getElementById('pointMessage').innerText = `${amount}Ps 送りました！`;
                    await Player.getPoints(myPlayFabId);
                    await Player.getRanking();
                }
            });
        }
    } catch (e) {
        document.getElementById('pointMessage').innerText = "スキャン失敗: " + e.message;
    }
}

// --- 船管理機能 ---

// ハードコードされた船情報を削除し、代わりに window.shipCatalog を使用します。

let shipCreateInFlight = false;

function showCreateShipModal() {
    const selectEl = document.getElementById('shipTypeSelect');
    selectEl.innerHTML = ''; // 既存のオプションをクリア

    if (!window.shipCatalog || Object.keys(window.shipCatalog).length === 0) {
        selectEl.innerHTML = '<option value="">利用可能な船がありません</option>';
        document.getElementById('shipTypeDetails').innerHTML = '船の情報を取得できませんでした。';
        document.getElementById('btnConfirmCreateShip').disabled = true;
        return;
    }

    document.getElementById('btnConfirmCreateShip').disabled = false;

    // カタログから船のリストを<option>として追加（種族制限あり）
    const myRace = String(window.myAvatarBaseInfo?.Race || '').toLowerCase().trim();
    for (const itemId in window.shipCatalog) {
        const ship = window.shipCatalog[itemId];
        const shipRace = String(ship?.race || ship?.Race || '').toLowerCase().trim();
        if (shipRace && shipRace !== 'common' && myRace && shipRace !== myRace) {
            continue;
        }
        const option = document.createElement('option');
        option.value = itemId;
        option.textContent = ship.DisplayName;
        selectEl.appendChild(option);
    }

    document.getElementById('shipCreateModal').style.display = 'flex';
    // 最初の項目で詳細を更新
    updateShipTypeDetails();
}

function updateShipTypeDetails() {
    const shipItemId = document.getElementById('shipTypeSelect').value;
    if (!shipItemId || !window.shipCatalog[shipItemId]) {
        document.getElementById('shipTypeDetails').innerHTML = '';
        return;
    }

    const info = window.shipCatalog[shipItemId];
    const currencyPrices = info.VirtualCurrencyPrices || {};
    const currencyCode =
        (currencyPrices.PS != null) ? 'PS' :
        ((currencyPrices.PT != null) ? 'PT' :
        ((currencyPrices.GO != null) ? 'GO' : 'PT'));
    const cost = currencyPrices[currencyCode] || 0;

    const domainLabel = (() => {
        switch (info.Domain) {
            case 'sea_underwater': return '海中';
            case 'air': return '飛空';
            case 'sea_surface':
            default: return '海上';
        }
    })();

    const catalogVision = Number(info.VisionRange);
    const visionValue = Number.isFinite(catalogVision) ? catalogVision : Number(info?.Stats?.VisionRange || 0);

    document.getElementById('shipTypeDetails').innerHTML = `
        <div>タイプ: ${domainLabel}</div>
        <div>HP: ${info.MaxHP}</div>
        <div>速度: ${info.Speed} タイル/秒</div>
        <div>視覚距離: ${visionValue}</div>
        <div>積荷容量: ${info.CargoCapacity}</div>
        <div>乗組員: ${info.CrewCapacity}人</div>
        <div style="margin-top: 8px; color: var(--accent-color);">建造費用: ${cost} ${currencyCode}</div>
    `;
}

async function confirmCreateShip(playFabId) {
    if (shipCreateInFlight) return;
    const shipItemId = document.getElementById('shipTypeSelect').value;
    if (!shipItemId) {
        alert('???????????????');
        return;
    }
    const spawnPosition = { x: 100, y: 100 }; 
    const confirmBtn = document.getElementById('btnConfirmCreateShip');
    shipCreateInFlight = true;
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        const data = await Ship.createShip(playFabId, shipItemId, spawnPosition);
        if (data) {
            document.getElementById('shipCreateModal').style.display = 'none';
            alert(`Ship created: ${window.shipCatalog[shipItemId].DisplayName}`);
            try {
                await Ship.setActiveShip(playFabId, data.shipId);
            } catch (e) {
                console.warn('[confirmCreateShip] Failed to set active ship:', e);
            }
            await Player.getPoints(playFabId); // ??????
        }
    } finally {
        shipCreateInFlight = false;
        if (confirmBtn) confirmBtn.disabled = false;
    }
}


async function viewShipDetails(shipId) {
    const positionData = await Ship.getShipPosition(shipId);
    if (!positionData) return;

    const assetData = await Ship.getShipAsset(myPlayFabId, shipId);
    const currentPos = Ship.calculateCurrentPosition(positionData.movement, positionData.position);

    const catalogItem = (() => {
        if (!window.shipCatalog || !assetData) return null;
        if (assetData.ItemId && window.shipCatalog[assetData.ItemId]) return window.shipCatalog[assetData.ItemId];
        if (assetData.ShipType) {
            return Object.values(window.shipCatalog).find(item => item.DisplayName === assetData.ShipType) || null;
        }
        return null;
    })();
    const catalogVision = catalogItem ? Number(catalogItem.VisionRange) : Number.NaN;
    const visionValue = Number.isFinite(catalogVision)
        ? catalogVision
        : Number(assetData?.Stats?.VisionRange || 0);

    document.getElementById('shipDetailsContent').innerHTML = `
        <div style="margin-bottom: 16px;">
            <h3>${assetData ? assetData.ShipType : '不明'}</h3>
            <div style="font-size: 12px; color: var(--text-sub);">${shipId}</div>
        </div>
        ${assetData ? `
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px; margin-bottom: 12px;">
            <h4>ステータス</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; margin-top: 8px;">
                <div>タイプ: ${(() => { switch (assetData.Domain) { case 'sea_underwater': return '海中'; case 'air': return '飛空'; case 'sea_surface': default: return '海上'; } })()}</div>
                <div>HP: <span style="color: var(--hp-color);">${assetData.Stats.CurrentHP}/${assetData.Stats.MaxHP}</span></div>
                <div>速度: ${assetData.Stats.Speed}</div>
                <div>視覚距離: ${visionValue}</div>
                <div>積荷: ${assetData.Cargo.length}/${assetData.Stats.CargoCapacity}</div>
                <div>乗組員: ${assetData.Crew.length}/${assetData.Stats.CrewCapacity}</div>
            </div>
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px; margin-bottom: 12px;">
            <h4>装備</h4>
            <div style="font-size: 13px; margin-top: 8px;">
                <div>大砲: ${assetData.Equipment.Cannon || 'なし'}</div>
                <div>帆: ${assetData.Equipment.Sail || 'なし'}</div>
                <div>船体: ${assetData.Equipment.Hull || 'なし'}</div>
                <div>錨: ${assetData.Equipment.Anchor || 'なし'}</div>
            </div>
        </div>
        ` : ''}
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px;">
            <h4>位置情報</h4>
            <div style="font-size: 13px; margin-top: 8px;">
                <div>現在位置: (${Math.round(currentPos.x)}, ${Math.round(currentPos.y)})</div>
                <div>状態: ${positionData.movement.isMoving ? '航海中' : '停泊中'}</div>
                ${positionData.movement.isMoving ? `
                <div style="margin-top: 8px;">
                    <div>出発地: (${Math.round(positionData.movement.departurePos.x)}, ${Math.round(positionData.movement.departurePos.y)})</div>
                    <div>目的地: (${Math.round(positionData.movement.destinationPos.x)}, ${Math.round(positionData.movement.destinationPos.y)})</div>
                    <div>到着予定: ${Ship.formatETA(positionData.movement.arrivalTime)}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    document.getElementById('shipDetailsModal').style.display = 'flex';
}

async function stopShip(shipId) {
    if (!confirm('この船を停止しますか？')) return;

    const data = await Ship.stopShip(shipId);
    if (data) {
        alert('船を停止しました');
        await Ship.displayPlayerShips(myPlayFabId);
    }
}

function startShipVoyageUI(shipId) {
    showTab('map', { playFabId: myPlayFabId, race: myAvatarBaseInfo.Race, nation: myAvatarBaseInfo.Nation });
    alert('Select a destination on the map to start the voyage.');
}


// --- グローバルスコープへの登録 ---
// HTMLのonclick属性から呼び出せるように、モジュールスコープ内の関数をwindowオブジェクトに登録します。
window.showTab = (tabId) => showTab(tabId, { playFabId: myPlayFabId, race: myAvatarBaseInfo.Race, nation: myAvatarBaseInfo.Nation });
window.equipItem = (itemId, slot) => Inventory.equipItem(myPlayFabId, itemId, slot);
window.useItem = (instanceId, itemId) => Inventory.useItem(myPlayFabId, instanceId, itemId);
window.sellItem = (instanceId, itemId) => Inventory.sellItem(myPlayFabId, instanceId, itemId);
window.showSellConfirmationModal = Inventory.showSellConfirmationModal;
window.viewShipDetails = viewShipDetails;
window.stopShip = stopShip;
window.startShipVoyageUI = startShipVoyageUI;
window.setActiveShip = (shipId) => Ship.setActiveShip(myPlayFabId, shipId);
window.Island = Island;

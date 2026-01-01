// c:/Users/ikeda/my-liff-app/public/js/ui.js

import * as Player from './player.js';
import * as Inventory from './inventory.js';
import * as Guild from './guild.js';
import * as Ship from './ship.js';
import * as NationKing from './nationKing.js';

let gameInstance = null;
let launchGameFn = null;
const tabLoaded = { home: false, ships: false, map: false, qr: false, inventory: false, ranking: false, king: false };
const audioAvailabilityCache = new Map();
const audioAvailabilityInFlight = new Set();

export function msToTime(durationMs) {
    if (durationMs <= 0) return "0秒";
    const seconds = Math.floor((durationMs / 1000) % 60);
    const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
    const hours = Math.floor((durationMs / (1000 * 60 * 60)));
    let parts = [];
    if (hours > 0) parts.push(hours + "時間");
    if (minutes > 0) parts.push(minutes + "分");
    if (seconds > 0 || parts.length === 0) parts.push(seconds + "秒");
    return parts.join("");
}

export function playSound(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio || !canPlayAudioElement(audio)) return;
    audio.currentTime = 0;
    audio.play().catch(e => console.warn(`Audio play failed (${audioId}):`, e));
}

export function canPlayAudioElement(audio) {
    if (!audio) return false;
    const urls = collectAudioUrls(audio);
    if (urls.length === 0) return false;

    for (const url of urls) {
        const cached = audioAvailabilityCache.get(url);
        if (cached === true) return true;
        if (cached === undefined) scheduleAudioCheck(url);
    }

    return false;
}

function collectAudioUrls(audio) {
    const urls = [];
    if (audio.currentSrc) urls.push(audio.currentSrc);
    if (audio.src && String(audio.src).trim() !== '') urls.push(audio.src);
    const sources = Array.from(audio.querySelectorAll('source'));
    sources.forEach((source) => {
        if (source.src && String(source.src).trim() !== '') urls.push(source.src);
    });
    return urls.map(normalizeAudioUrl);
}

function normalizeAudioUrl(url) {
    try {
        return new URL(url, window.location.href).toString();
    } catch {
        return String(url);
    }
}

function scheduleAudioCheck(url) {
    if (audioAvailabilityCache.has(url) || audioAvailabilityInFlight.has(url)) return;
    audioAvailabilityInFlight.add(url);
    fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then(res => audioAvailabilityCache.set(url, res.ok))
        .catch(() => audioAvailabilityCache.set(url, false))
        .finally(() => audioAvailabilityInFlight.delete(url));
}

export function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (match) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
}

export async function showTab(tabId, playerInfo) {
    console.log('[showTab] Called with tabId:', tabId, 'playerInfo:', playerInfo);

    // 船タブから離れる場合はリスナーをクリーンアップ
    const currentActiveTab = document.querySelector('.nav-button.active');
    if (currentActiveTab && currentActiveTab.id === 'navShips' && tabId !== 'ships') {
        console.log('[showTab] Leaving ships tab, cleaning up listeners');
        Ship.cleanupShipListeners();
    }

    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-button').forEach(el => el.classList.remove('active'));

    const chatAreaEl = document.getElementById('chatArea');
    if (chatAreaEl) chatAreaEl.style.display = 'none';

    const contentEl = document.getElementById(`tabContent${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if (contentEl) contentEl.style.display = 'block';

    const navEl = document.getElementById(`nav${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if (navEl) navEl.classList.add('active');

    if (tabId === 'home' && chatAreaEl) chatAreaEl.style.display = 'block';

    try {
        if (!tabLoaded[tabId]) {
            console.log(`Loading data for tab: ${tabId}`);
            switch (tabId) {
                case 'home':
                    await Player.getPlayerStats(playerInfo.playFabId);
                    await Player.getPoints(playerInfo.playFabId);
                    break;
                case 'ships':
                    if (!playerInfo || !playerInfo.playFabId) {
                        console.warn('[showTab] ships tab requires playFabId');
                        break;
                    }
                    await Ship.displayPlayerShips(playerInfo.playFabId);
                    break;
                case 'inventory':
                    await Inventory.getInventory(playerInfo.playFabId);
                    await Player.getPoints(playerInfo.playFabId);
                    break;
                case 'ranking':
                    await Player.getRanking();
                    break;
                case 'king':
                    await NationKing.loadKingPage(playerInfo.playFabId);
                    break;
                case 'qr':
                    await Player.getPoints(playerInfo.playFabId);
                    await Guild.loadGuildInfo(playerInfo.playFabId);
                    break;
                case 'map':
                    if (gameInstance) {
                        tabLoaded[tabId] = true;
                        // ゲームが既に存在する場合は、リサイズして再表示
                        await new Promise(resolve => requestAnimationFrame(resolve));
                        const container = document.getElementById('phaser-container');
                        if (container && gameInstance.scale) {
                            gameInstance.scale.resize(container.clientWidth, container.clientHeight);
                        }
                        return; // Don't launch twice
                    }
                    // コンテナのサイズが確定するまで待機
                    const container = document.getElementById('phaser-container');
                    let retries = 0;
                    while ((!container || container.clientWidth === 0 || container.clientHeight === 0) && retries < 10) {
                        await new Promise(resolve => requestAnimationFrame(resolve));
                        retries++;
                    }

                    if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
                        console.error('[Phaser] Container still has zero dimensions after waiting.');
                        break;
                    }

                    console.log("Launching Phaser game with playerInfo:", playerInfo);
                    if (!launchGameFn) {
                        const gameModule = await import('../Game.js');
                        launchGameFn = gameModule.launchGame;
                    }
                    gameInstance = launchGameFn('phaser-container', playerInfo);
                    if (gameInstance) {
                        Object.defineProperty(window, 'gameInstance', { get: () => gameInstance });
                    }
                    break;
            }
            tabLoaded[tabId] = true;
        }
    } catch (error) {
        console.error(`Failed to load data for tab ${tabId}:`, error);
    }
}

export function showConfirmationModal(amount, receiverId, onConfirm) {
    playSound('audioCoin');
    document.getElementById('modalAmount').innerText = `${amount}Ps`;
    document.getElementById('modalReceiverId').innerText = receiverId;
    const modal = document.getElementById('confirmationModal');
    modal.style.display = 'flex';

    const confirmBtn = document.getElementById('btnConfirmTransfer');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        onConfirm();
    });

    const cancelBtn = document.getElementById('btnCancelTransfer');
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('pointMessage').innerText = "キャンセルしました。";
    });
}

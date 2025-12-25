// c:/Users/ikeda/my-liff-app/public/js/voyage.js

import { callApiWithLoader } from './api.js';
import { msToTime, playSound } from './ui.js';
import * as Inventory from './inventory.js';
import * as Player from './player.js';

let voyageTimer = null;

function updateVoyageDisplay(status, destination, remainingMs, message) {
    const statusTextEl = document.getElementById('voyageStatusText');
    const rewardTextEl = document.getElementById('voyageRewardText');
    if (voyageTimer) { clearInterval(voyageTimer); voyageTimer = null; }

    rewardTextEl.innerText = '';
    document.getElementById('voyageMissionButtons').style.display = 'none';
    document.getElementById('btnCheckVoyageStatus').style.display = 'none';
    document.getElementById('btnReturnToPort').style.display = 'none';

    switch (status) {
        case "Idle":
            statusTextEl.innerText = message || "航海していません。";
            document.getElementById('voyageMissionButtons').style.display = 'block';
            break;
        case "Arrived":
            statusTextEl.innerText = `「${destination}」に到着しました！`;
            document.getElementById('btnReturnToPort').style.display = 'block';
            break;
        case "Outbound":
        case "Returning":
            const statusLabel = (status === "Outbound") ? "航海中" : "帰港中";
            const endTime = Date.now() + remainingMs;
            voyageTimer = setInterval(() => {
                const newRemainingMs = endTime - Date.now();
                if (newRemainingMs <= 0) {
                    statusTextEl.innerText = `（${destination}）${statusLabel}... 到着！`;
                    clearInterval(voyageTimer);
                    voyageTimer = null;
                    checkVoyageStatus(window.myPlayFabId); // グローバルからIDを取得
                } else {
                    statusTextEl.innerText = `（${destination}）${statusLabel}... 残り ${msToTime(newRemainingMs)}`;
                }
            }, 1000);
            statusTextEl.innerText = `（${destination}）${statusLabel}... 残り ${msToTime(remainingMs)}`;
            document.getElementById('btnCheckVoyageStatus').style.display = 'block';
            break;
        case "Reward":
            playSound('audioVoyageReward');
            statusTextEl.innerText = "帰港しました！";
            rewardTextEl.innerText = message;
            document.getElementById('voyageMissionButtons').style.display = 'block';
            Inventory.getInventory(window.myPlayFabId);
            Player.getPlayerStats(window.myPlayFabId);
            break;
        default:
            statusTextEl.innerText = "（不明なステータス）";
            document.getElementById('voyageMissionButtons').style.display = 'block';
    }
}

export async function startVoyage(playFabId, missionId) {
    document.getElementById('voyageRewardText').innerText = '';
    const data = await callApiWithLoader('/api/start-voyage', { playFabId, missionId });
    if (data) {
        playSound('audioVoyageStart');
        updateVoyageDisplay(data.status, data.destination, data.remainingMs, data.message);
    }
}

export async function returnToPort(playFabId) {
    document.getElementById('voyageRewardText').innerText = '';
    const data = await callApiWithLoader('/api/return-to-port', { playFabId });
    if (data) updateVoyageDisplay(data.status, data.destination, data.remainingMs, data.message);
}

export async function checkVoyageStatus(playFabId) {
    document.getElementById('voyageRewardText').innerText = '';
    const data = await callApiWithLoader('/api/check-voyage-status', { playFabId });
    if (data) updateVoyageDisplay(data.status, data.destination, data.remainingMs, data.message);
}
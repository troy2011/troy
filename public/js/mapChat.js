// c:/Users/ikeda/my-liff-app/public/js/mapChat.js
import {
    getGuildInfo,
    getGuildChat,
    getNearbyChat,
    getGlobalChat,
    sendGuildChat,
    sendNearbyChat,
    sendGlobalChat
} from './playfabClient.js';
import { showRpgMessage } from './rpgMessages.js';

function getPlayerDisplayName() {
    return window.myLineProfile?.displayName || window.myPlayFabId || 'Player';
}

function getPlayerPosition() {
    const scene = window.worldMapScene;
    const ship = scene?.playerShip;
    if (!ship) return null;
    return { x: Number(ship.x) || 0, y: Number(ship.y) || 0 };
}

function createChatController(options) {
    const config = {
        containerId: options.containerId,
        inputId: options.inputId,
        sendButtonId: options.sendButtonId,
        tabSelector: options.tabSelector,
        isActive: options.isActive,
        defaultChannel: options.defaultChannel || 'global'
    };
    let activeChannel = config.defaultChannel;
    let pollTimer = null;
    let cachedGuildId = null;
    let wired = false;

    function getChatElements() {
        return {
            container: document.getElementById(config.containerId),
            input: document.getElementById(config.inputId),
            sendButton: document.getElementById(config.sendButtonId),
            tabButtons: Array.from(document.querySelectorAll(config.tabSelector))
        };
    }

    async function getGuildId(playFabId) {
        if (cachedGuildId) return cachedGuildId;
        const data = await getGuildInfo(playFabId, null, { isSilent: true });
        if (data?.guild?.guildId) {
            cachedGuildId = data.guild.guildId;
            return cachedGuildId;
        }
        return null;
    }

    function renderMessages(messages) {
        const { container } = getChatElements();
        if (!container) return;
        container.innerHTML = '';
        if (!messages || messages.length === 0) {
            container.innerHTML = '<div style="text-align:center; color: var(--text-sub); padding: 8px;">メッセージはまだありません</div>';
            return;
        }
        messages.forEach((msg) => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom: 8px; padding: 6px 8px; background: rgba(255,255,255,0.04); border-radius: 6px;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom: 2px;';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = msg.displayName || 'Player';
            nameSpan.style.cssText = 'font-weight: 700; color: var(--accent-color); font-size: 12px;';

            const timeSpan = document.createElement('span');
            const ts = msg.timestamp ? new Date(msg.timestamp) : new Date();
            timeSpan.textContent = ts.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            timeSpan.style.cssText = 'font-size: 10px; color: var(--text-sub);';

            const body = document.createElement('div');
            body.textContent = msg.message || '';
            body.style.cssText = 'font-size: 13px; color: var(--text-main); word-wrap: break-word;';

            header.appendChild(nameSpan);
            header.appendChild(timeSpan);
            row.appendChild(header);
            row.appendChild(body);
            container.appendChild(row);
        });
        container.scrollTop = container.scrollHeight;
    }

    async function fetchMessages(playFabId) {
        if (!playFabId) return [];
        if (activeChannel === 'guild') {
            const guildId = await getGuildId(playFabId);
            if (!guildId) return [];
            const data = await getGuildChat(playFabId, guildId, { isSilent: true });
            return Array.isArray(data?.messages) ? data.messages : [];
        }
        if (activeChannel === 'nearby') {
            const pos = getPlayerPosition();
            const data = await getNearbyChat(playFabId, pos?.x, pos?.y, window.__currentMapId || null, { isSilent: true });
            return Array.isArray(data?.messages) ? data.messages : [];
        }
        const data = await getGlobalChat(playFabId, { isSilent: true });
        return Array.isArray(data?.messages) ? data.messages : [];
    }

    async function sendMessage(playFabId, message) {
        const payload = {
            playFabId,
            displayName: getPlayerDisplayName(),
            message
        };
        if (activeChannel === 'guild') {
            const guildId = await getGuildId(playFabId);
            if (!guildId) {
                showRpgMessage('ギルドに所属していません');
                return false;
            }
            const res = await sendGuildChat(playFabId, guildId, payload.message);
            return !!res?.success;
        }
        if (activeChannel === 'nearby') {
            const pos = getPlayerPosition();
            const res = await sendNearbyChat({ ...payload, x: pos?.x, y: pos?.y });
            return !!res?.success;
        }
        const res = await sendGlobalChat(payload);
        return !!res?.success;
    }

    async function refreshMessages(playFabId) {
        const messages = await fetchMessages(playFabId);
        renderMessages(messages);
    }

    function setActiveChannel(channel, playFabId) {
        activeChannel = channel;
        const { tabButtons } = getChatElements();
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.chat === channel);
        });
        refreshMessages(playFabId);
    }

    function startPolling(playFabId) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            const isActive = typeof config.isActive === 'function' ? config.isActive() : true;
            if (!isActive) return;
            refreshMessages(playFabId);
        }, 5000);
    }

    function init(playFabId) {
        if (wired) return;
        wired = true;
        const { input, sendButton, tabButtons } = getChatElements();
        if (!input || !sendButton) return;

        tabButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                setActiveChannel(btn.dataset.chat, playFabId);
            });
        });

        sendButton.addEventListener('click', async () => {
            const message = input.value.trim();
            if (!message) return;
            const ok = await sendMessage(playFabId, message);
            if (ok) {
                input.value = '';
                await refreshMessages(playFabId);
            }
        });

        input.addEventListener('keypress', async (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            sendButton.click();
        });

        setActiveChannel(activeChannel, playFabId);
        startPolling(playFabId);
    }

    return { init };
}

let mapController = null;
let troyController = null;

export function initMapChat(playFabId) {
    if (!mapController) {
        mapController = createChatController({
            containerId: 'chatMessages',
            inputId: 'chatInput',
            sendButtonId: 'btnSendChat',
            tabSelector: '#mapChatArea .map-chat-tab',
            isActive: () => {
                const mapTab = document.getElementById('tabContentMap');
                return !!mapTab && mapTab.style.display !== 'none';
            }
        });
    }
    mapController.init(playFabId);
}

export function initTroyChat(playFabId) {
    if (!troyController) {
        troyController = createChatController({
            containerId: 'troyChatMessages',
            inputId: 'troyChatInput',
            sendButtonId: 'btnSendTroyChat',
            tabSelector: '#troyChatArea .map-chat-tab',
            isActive: () => {
                const troyTab = document.getElementById('tabContentTroy');
                return !!troyTab && troyTab.style.display !== 'none';
            }
        });
    }
    troyController.init(playFabId);
}

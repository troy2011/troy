// c:/Users/ikeda/my-liff-app/public/js/rpgMessages.js

let activeMessageElement = null;

function isErrorMessage(text, options = {}) {
    if (options?.type === 'error' || options?.isError === true) return true;
    if (options?.type === 'normal' || options?.isError === false) return false;
    const value = String(text || '');
    return /失敗|エラー|不足|不正|無効|できません|取得できません|読み取れません|必要です|CLOSE中|failed|error|missing|invalid|cannot/i.test(value);
}

function makeMessageElement(text, options = {}) {
    const msg = document.createElement('div');
    msg.className = `rpg-message-popup ${isErrorMessage(text, options) ? 'is-error' : 'is-normal'}`;
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    msg.textContent = text;
    return msg;
}

function syncMessageToVisibleViewport(msg) {
    if (!msg) return () => {};
    const update = () => {
        const viewport = window.visualViewport;
        const baseBottom = 78;
        const hiddenBottom = viewport
            ? Math.max(0, window.innerHeight - (viewport.offsetTop + viewport.height))
            : 0;
        msg.style.setProperty('--rpg-message-bottom', `${Math.ceil(baseBottom + hiddenBottom)}px`);
    };
    update();
    const viewport = window.visualViewport;
    if (!viewport) return () => {};
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
        viewport.removeEventListener('resize', update);
        viewport.removeEventListener('scroll', update);
    };
}

export function showRpgMessage(text, durationMs = 4000, options = {}) {
    if (!text) return;
    if (activeMessageElement?.parentElement) {
        activeMessageElement.remove();
    }
    const msg = makeMessageElement(text, options);
    const cleanupViewportSync = syncMessageToVisibleViewport(msg);
    activeMessageElement = msg;
    document.body.appendChild(msg);
    setTimeout(() => {
        cleanupViewportSync();
        if (msg.parentElement) msg.remove();
        if (activeMessageElement === msg) activeMessageElement = null;
    }, durationMs);
}

export const rpgSay = {
    kingGreeting: (name) => `王：よく来た「${name}」。これを授けよう。`,
    shipGained: () => 'ふねをてにいれた！',
    islandGained: (name) => `${name}をてにいれた！`,
    buildStarted: (name) => `${name}の建設をはじめた！`,
    buildUpgraded: (name, level = null, effectText = '') => {
        const levelPart = level ? `Lv${level}に` : '';
        const effectPart = effectText ? ` ${effectText}` : '';
        return `${name}を${levelPart}強化した！${effectPart}`.trim();
    },
    buildCompleted: () => '建設が完了した！',
    resourceGained: (code, amount) => `${code} を ${amount} てにいれた！`,
    islandClaimed: (name) => `${name}を占領した！`,
    islandAbandoned: (name) => `${name}を手放した。`,
    islandDemolished: (name) => `${name}は瓦礫になった…`,
    islandRebuilt: (name) => `${name}がよみがえった！`,
    shipCreated: (name) => `${name}を建造した！`,
    shipSunk: () => 'ふねが沈んだ…',
    shipRespawned: () => 'ふねが復活した！',
    battleWin: () => 'しょうり！',
    battleLose: () => 'まけてしまった…',
    guildCreated: (name) => `ギルド「${name}」を結成した！`,
    guildJoined: (name) => `ギルド「${name}」に加入した！`,
    guildLeft: (name) => `ギルド「${name}」を脱退した。`,
    guildWarehouseWithdrawn: () => '倉庫からアイテムを引き出した！',
    guildApplicationApproved: () => '加入申請を承認した！',
    guildApplicationRejected: () => '加入申請を拒否した。',
    exileDone: () => '亡命が完了した！',
    tutorialNav: () => 'ナビで島へ向かおう。',
    tutorialArrived: () => '島に到着！島をクリックしてマイハウスを建てよう。',
    tutorialHouseBuilt: () => 'マイハウスが建った！'
};

if (typeof window !== 'undefined') {
    window.showRpgMessage = showRpgMessage;
    window.rpgSay = rpgSay;
}

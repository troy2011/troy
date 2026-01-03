// c:/Users/ikeda/my-liff-app/public/js/rpgMessages.js

function makeMessageElement(text) {
    const msg = document.createElement('div');
    msg.style.cssText = [
        'position: fixed',
        'left: 12px',
        'right: 12px',
        'bottom: 90px',
        'z-index: 9999',
        'background: rgba(17,24,39,0.95)',
        'border: 1px solid #334155',
        'color: #fff',
        'padding: 12px 14px',
        'border-radius: 10px',
        'font-size: 13px',
        'font-weight: 700'
    ].join(';');
    msg.textContent = text;
    return msg;
}

export function showRpgMessage(text, durationMs = 4000) {
    if (!text) return;
    const msg = makeMessageElement(text);
    document.body.appendChild(msg);
    setTimeout(() => {
        if (msg.parentElement) msg.remove();
    }, durationMs);
}

export const rpgSay = {
    kingGreeting: (name) => `王：よく来た「${name}」。これを授けよう。`,
    shipGained: () => 'ふねをてにいれた！',
    islandGained: (name) => `${name}をてにいれた！`,
    buildStarted: (name) => `${name}の建設をはじめた！`,
    buildUpgraded: (name) => `${name}を強化した！`,
    buildCompleted: () => '建設が完了した！',
    resourceGained: (code, amount) => `${code} を ${amount} てにいれた！`,
    islandClaimed: (name) => `${name}を占領した！`,
    islandAbandoned: (name) => `${name}を手放した。`,
    shipCreated: (name) => `${name}を建造した！`,
    exileDone: () => '亡命が完了した！'
};

if (typeof window !== 'undefined') {
    window.showRpgMessage = showRpgMessage;
    window.rpgSay = rpgSay;
}

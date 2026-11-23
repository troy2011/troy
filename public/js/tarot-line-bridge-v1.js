import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from './config.js';

const status = document.getElementById('bridgeStatus');
const form = document.getElementById('bridgeForm');
const opaque = /^[A-Za-z0-9_-]{43}$/;
async function authorize() {
    const state = new URLSearchParams(location.search).get('state') || '';
    if (!opaque.test(state)) throw Error('state');
    const auth = getAuth(initializeApp(firebaseConfig));
    await auth.authStateReady();
    if (!auth.currentUser) {
        status.textContent = '同じブラウザーでTROYを開き、LINEでログインしてからもう一度お試しください。';
        return;
    }
    const token = await auth.currentUser.getIdToken();
    const response = await fetch('/api/tarot/authorize', {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization: 'Bearer ' + token },
        body:JSON.stringify({state}), cache:'no-store', redirect:'error'
    });
    if (response.status === 401 || response.status === 403) {
        status.textContent = 'TROYでLINEログインを確認してから、もう一度お試しください。';
        return;
    }
    if (!response.ok) throw Error('authorize');
    const {code} = await response.json();
    if (!opaque.test(code || '')) throw Error('code');
    form.elements.namedItem('state').value = state;
    form.elements.namedItem('code').value = code;
    status.textContent = 'タロットキングダムの対戦ロビーへ進みます。';
    form.hidden = false;
    form.submit();
}
const enroll = document.getElementById('enrollForm');
if (enroll) enroll.addEventListener('submit', async event => {
    event.preventDefault();
    const field = enroll.elements.namedItem('invitation');
    const invitation = field.value.trim(); field.value = '';
    const button = enroll.querySelector('button'); button.disabled = true;
    try {
        const auth = getAuth(initializeApp(firebaseConfig));
        await auth.authStateReady();
        if (!auth.currentUser || !opaque.test(invitation)) throw Error('enroll');
        const end = await fetch('/api/tarot/enroll', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+await auth.currentUser.getIdToken()}, body:JSON.stringify({invitation}), cache:'no-store', redirect:'error'});
        if (!end.ok) throw Error('enroll');
        const {subject} = await end.json();
        if (!opaque.test(subject)) throw Error('enroll');
        document.getElementById('enrollSubject').textContent = subject;
        status.textContent = '登録ID';
    } catch { status.textContent = '確認できませんでした。TROYを開き、このブラウザでLINEログインしてからもう一度お試しください。'; }
    finally { button.disabled = false; }
});
else authorize().catch(() => {
    status.textContent = '接続できませんでした。TROYへ戻ってもう一度お試しください。';
});

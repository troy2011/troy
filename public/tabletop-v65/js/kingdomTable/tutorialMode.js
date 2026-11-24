import { quickOutcome, quickAction } from './tutorialQuickCopy.js?v=quick-tutorial-v1';
import { CHAPTERS, ME, NAMES, startChapter, currentStep, chapterDone, perform, performCpu } from './tutorialScript.js?v=pirate-ability-v1';
export { CHAPTERS, NAMES };
const DONE_KEY = 'tarot-kingdom-tutorial:done';
const $ = id => document.getElementById(id);
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export function doneChapters() {
    try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { return new Set(); }
}
function markDone(id) {
    const done = doneChapters();
    done.add(id);
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* This visit only. */ }
}


export function tutorialIndex(params) {
    const value = params.get('tutorial');
    if (!value || !/^\d+$/.test(value)) return null;
    const index = Number(value) - 1;
    return CHAPTERS[index] ? index : null;
}

export const tutorialHref = index => '/tarot-kingdom-table.html?tutorial=' + (index+1);
const pickerHref = () => document.documentElement.dataset.tutorialPicker || '/tarot-kingdom-tutorial.html';
const introCue = { basics:'先に手札をなくせば勝ち', numbers:'数字の効果を試そう', majors:'大札の効果を試そう', roles:'5枚役を出してみよう', finish:'コールして上がろう' };

function disclosure(label, body) {
    const details = el('details','kt-tutorial-disclosure');
    details.append(el('summary','',label), ...body);
    return details;
}

export function createTutorialMode({ loadMatch, render, openDialog, closeDialog, selection, applyOrigins, clearSelection }) {
    let session, timer, reading, ready, finished, hint, detailText;
    const step = () => currentStep(session);
    const mine = () => ready && !reading && !finished && step()?.seat === ME && session.match.round.turn === ME;
    const title = () => `第${session.index+1}章 ${session.chapter.title}`;
    function selectAllowed(id) {
        if (!mine() || step().type !== 'play') return false;
        if (!step().cards.includes(id)) {
            hint = '光る札だけ選ぶ';
            paint();
            return false;
        }
        hint = '';
        return true;
    }
    function paint() {
        const current = step();
        const isMine = mine();
        const host = $('ktHand');
        const targets = new Set(isMine && current.type === 'play' ? current.cards : []);
        for (const node of host.children) {
            node.classList.toggle('is-tutorial-target', targets.has(node.dataset.card) && !selection().includes(node.dataset.card));
            node.classList.toggle('is-tutorial-other', targets.size > 0 && !targets.has(node.dataset.card));
        }
        const pick = selection();
        const canPlay = isMine && current.type === 'play' && pick.length === targets.size && pick.every(id=>targets.has(id));
        const canPass = isMine && current.type === 'pass';
        $('ktDraw').disabled = true;
        $('ktPlay').disabled ||= !canPlay;
        $('ktPass').disabled ||= !canPass;
        $('ktPlay').classList.toggle('is-tutorial-target', !$('ktPlay').disabled);
        $('ktPass').classList.toggle('is-tutorial-target', !$('ktPass').disabled);
        $('ktTutorialNext').hidden = !reading;
        $('ktTutorialNext').classList.toggle('is-tutorial-target', Boolean(reading));
        detailText = reading || (isMine ? current.before : '');
        $('ktTutorialDetail').hidden = !detailText;
        const progress = session.chapter.steps.slice(0, session.step).filter(s=>s.seat===ME).length;
        const steps = session.chapter.steps.filter(s=>s.seat===ME).length;
        $('ktTutorialProgress').textContent = `${title()}　${Math.min(progress+Number(isMine),steps)}/${steps}`;
        const text = hint || (reading ? quickOutcome(session.chapter.id, session.step - 1) : isMine
            ? quickAction(current.type, targets.size, pick.length, $('ktPlay').textContent)
            : finished ? 'クリア！' : !ready ? '準備できたら始める' : '相手の番');
        if ($('ktTutorialText').textContent !== text) {
            $('ktTutorialText').textContent = text;
            $('ktTutorialText').scrollTop = 0;
        }
        document.body.dataset.ttStep = `${session.index}:${session.step}${reading?':read':''}`;
    }

    function complete() {
        if (finished) return;
        finished = true;
        render();
        markDone(session.chapter.id);
        const last = session.index === CHAPTERS.length - 1;
        const extra = session.result ? resultBody(session) : [];
        extra.push(el('p','',session.chapter.outro));
        if (session.chapter.table) extra.push(roleTable());
        const body = [];
        if (session.result) body.push(el('p','kt-result-note','合計 ' + session.result.winnerHan + '翻'));
        body.push(disclosure(session.result ? '得点とルールの詳細' : 'ルールの詳細', extra));
        const next = last ? ['ホームへ',()=>{location.href='/tarot-kingdom-table.html';},true]
            : ['次の章へ',()=>launch(session.index+1,true),true];
        openDialog(last ? 'チュートリアル完了' : `第${session.index+1}章 クリア`, body, [next,['章を終了',back]]);
    }
    function flow() {
        clearTimeout(timer);
        render();
        if (reading || finished || !ready) return;
        if (chapterDone(session)) { complete(); return; }
        if (step().seat !== ME) {
            timer = setTimeout(()=>{
                const current = step();
                const result = performCpu(session);
                if (result.ok) afterStep(current);
                else { hint = '章をやり直してください：' + result.reason; ready=false; render(); }
            }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 420 : 760);
        }
    }
    function afterStep(current) {
        hint = '';
        reading = current.after || '';
        flow();
        if (reading) $('ktTutorialNext').focus({preventScroll:true});
    }
    function act(type) {
        if (!mine()) return;
        const current = step();
        const ids = selection();
        const result = perform(session,{seat:ME,type,ids});
        if (!result.ok) { hint=result.reason; paint(); return; }
        if (type==='play') applyOrigins(ids);
        clearSelection();
        afterStep(current);
    }

    function launch(index, replace = false) {
        clearTimeout(timer);
        closeDialog();
        session = startChapter(index);
        ready = finished = false;
        reading = hint = '';
        if (replace) history.replaceState(history.state,'',tutorialHref(index));
        loadMatch(session.match);
        render();
        openDialog(title(),[el('p','',introCue[session.chapter.id]), disclosure('詳しい説明',[el('p','',session.chapter.intro)])],[['始める',()=>{closeDialog();ready=true;flow();},true]]);
    }
    function back() {
        clearTimeout(timer);
        // A chapter opened from the list returns to that entry, without making Back reopen it.
        const from = document.referrer ? new URL(document.referrer) : null;
        if (from?.origin===location.origin && from.pathname === pickerHref() && !from.searchParams.has('chapter')) history.back();
        else location.replace(pickerHref());
    }
    $('ktTutorialDetail').addEventListener('click', () => {
        if (!detailText) return;
        $('ktTutorialDetailText').textContent = detailText;
        $('ktTutorialDetailDialog').showModal();
    });
    $('ktTutorialNext').addEventListener('click',()=>{reading='';flow();});
    $('ktTutorialRestart').addEventListener('click',()=>launch(session.index));
    $('ktTutorialExit').addEventListener('click',back);
    return { launch, paint, selectAllowed, act, refresh:()=>render() };
}

function resultBody(session) {
    const result = session.result;
    const match = session.match, round = match.round, rules = match.rules, w = result.winner;
    const parts = [`上がり${rules.baseHan}`];
    const clear = round.majorClearHan?.[w] || 0;
    if (round.han[w] - clear) parts.push(`役${round.han[w] - clear}`);
    if (clear) parts.push(`大札流し${clear}`);
    if (result.lastCardHan) parts.push(`切札${result.lastCardHan}`);
    if (round.dealer === w) parts.push(`親${rules.dealerHan}`);
    const head = el('p', 'kt-result-head');
    head.append(el('strong', '', `${NAMES[w]} の上がり`), el('span', 'kt-han-pill kt-han-pill-big', `${result.winnerHan}翻`));
    const out = [head, el('p', 'kt-result-note', parts.join(' ＋ '))];
    for (const pay of result.payments) {
        const extra = [];
        if (pay.aces) extra.push(`A${pay.aces}枚 +${pay.aces * rules.aceHan}`);
        if (round.dealer === pay.from) extra.push(`親 +${rules.dealerHan}`);
        const text = el('p', 'kt-result-row', `${NAMES[pay.from]}：${pay.cards}枚 × ${pay.han}翻${extra.length ? `（${extra.join('、')}）` : ''} × ${rules.cardRate} ＝ `);
        text.append(el('strong', 'kt-chip', String(pay.paid)));
        out.push(text);
    }
    const pot = el('p', 'kt-result-pot', `場のチップ（各自20枚）も ${NAMES[w]} へ：`);
    pot.append(el('strong', 'kt-chip', String(result.pot)));
    out.push(pot);
    return out;
}

function roleTable() {
    const rows = [['ストレート', '2翻（ハイ：3翻）'], ['フラッシュ', '2翻（ハイ：3翻）'], ['フルハウス', '3翻（ハイ：4翻）'], ['フォーカード', '4翻'], ['エレメンタル', '10翻'], ['ザ・ワールド', '5翻（ハイ：15翻）'],
        ['ファイブカード', '10翻（ハイ：15翻）'], ['ストレートフラッシュ', '5翻'], ['ハイエレメンタル', '12翻'], ['ロイヤルストレートフラッシュ', '10翻']];

    const table = el('table', 'tt-table-han');
    table.append(el('caption', 'kt-dialog-label', '5枚役で場を流したときの翻（弱い順）'));
    const body = el('tbody');
    for (const [name, han] of rows) {
        const row = el('tr');
        const th = el('th', '', name);
        th.scope = 'row';
        row.append(th, el('td', '', han));
        body.append(row);
    }
    table.append(body);
    const notes = el('ul', 'tt-rules');
    notes.append(el('li', '', 'コールで作った役は1翻少なくなります。'),
        el('li', '', '大札0（愚者）は5枚役で好きな数字の代わりになります。'),
        el('li', '', 'エレメンタルは小札Aを4枚ともう1枚。悪魔15ならハイファイブカードです。'),
        el('li', '', 'ハイエレメンタルは大札16〜19ともう1枚の大札。世界21ならハイワールドです。'));
    const wrap = el('div');
    wrap.append(table, notes);
    return wrap;
}

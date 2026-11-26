import { settlementHanBreakdown, formatHanEntry } from './match.js?v=finish-locale-v1';
import { activeTableLanguage, localizedLabel, formatScoreHan } from './tableLocale.js?v=6';
import { tutorialCopy as copy, tutorialText, tutorialPageUrl, tutorialIsEnglish } from './tutorialLocale.js';
import { quickOutcome, quickAction } from './tutorialQuickCopy.js?v=full-locale-v1';
import { CHAPTERS, ME, NAMES, tutorialNames, startChapter, currentStep, chapterDone, perform, performCpu } from './tutorialScript.js?v=full-locale-v1';
export { CHAPTERS, NAMES, tutorialNames };
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

export const tutorialHref = index => tutorialPageUrl('/tarot-kingdom-table.html?tutorial=' + (index+1));
const pickerHref = () => document.documentElement.dataset.tutorialPicker || '/tarot-kingdom-tutorial.html';
const shortTitles = { basics: 'Basics', numbers: 'Rank effects', majors: 'Major Arcana', roles: 'Five-card hands', finish: 'Call and finish' };
const introCue = { basics:['先に手札をなくせば勝ち','Play all your cards first to win.'], numbers:['数字の効果を試そう','Try the different rank effects.'], majors:['大札の効果を試そう','Explore the effects of Major Arcana cards.'], roles:['5枚役を出してみよう','Try playing a five-card hand.'], finish:['コールして上がろう','Make a Call and go out.'] };

function disclosure(label, body) {
    const details = el('details','kt-tutorial-disclosure');
    details.append(el('summary','',label), ...body);
    return details;
}

export function createTutorialMode({ loadMatch, render, openDialog, closeDialog, selection, applyOrigins, clearSelection }) {
    let session, timer, reading, ready, finished, hint, detailText;
    const step = () => currentStep(session);
    const mine = () => ready && !reading && !finished && step()?.seat === ME && session.match.round.turn === ME;
    const title = () => copy(`第${session.index+1}章 ${session.chapter.title}`, `Chapter ${session.index+1}: ${tutorialText(session.chapter.title)}`);
    function selectAllowed(id) {
        if (!mine() || step().type !== 'play') return false;
        if (!step().cards.includes(id)) {
            hint = copy('光る札だけ選ぶ', 'Select only the glowing cards');
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
        detailText = tutorialText(reading || (isMine ? current.before : ''));
        $('ktTutorialDetail').hidden = !detailText;
        const progress = session.chapter.steps.slice(0, session.step).filter(s=>s.seat===ME).length;
        const steps = session.chapter.steps.filter(s=>s.seat===ME).length;
        $('ktTutorialProgress').textContent = `${copy(title(), `Ch. ${session.index+1} · ${shortTitles[session.chapter.id]}`)}${copy('　', ' ')}${Math.min(progress+Number(isMine),steps)}/${steps}`;
        const text = hint || (reading ? quickOutcome(session.chapter.id, session.step - 1) : isMine
            ? quickAction(current.type, targets.size, pick.length, $('ktPlay').textContent)
            : finished ? copy('クリア！', 'Complete!') : !ready ? copy('準備できたら始める', 'Start when you are ready') : copy('相手の番', 'Opponent’s turn'));
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
        extra.push(el('p','',tutorialText(session.chapter.outro)));
        if (session.chapter.table) extra.push(roleTable());
        const body = [];
        if (session.result) body.push(el('p','kt-result-note',copy('合計 ' + session.result.winnerHan + '翻', 'Total: ' + formatScoreHan(session.result.winnerHan, 'en'))));
        body.push(disclosure(session.result ? copy('得点とルールの詳細', 'Scoring and rules') : copy('ルールの詳細', 'Rules in detail'), extra));
        const next = last ? [copy('ホームへ', 'Home'),()=>{location.href=tutorialPageUrl('/tarot-kingdom-table.html');},true]
            : [copy('次の章へ', 'Next chapter'),()=>launch(session.index+1,true),true];
        openDialog(last ? copy('チュートリアル完了', 'Tutorial complete') : copy(`第${session.index+1}章 クリア`, `Chapter ${session.index+1} complete`), body, [next,[copy('章を終了', 'Exit chapter'),back]]);
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
                else { hint = copy('章をやり直してください：' + result.reason, 'Please restart this chapter.'); ready=false; render(); }
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
        if (!result.ok) { hint=tutorialIsEnglish() && /[\u3040-\u30ff\u3400-\u9fff]/u.test(result.reason) ? 'Please follow the highlighted move.' : result.reason; paint(); return; }
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
        openDialog(title(),[el('p','',copy(...introCue[session.chapter.id])), disclosure(copy('詳しい説明', 'More details'),[el('p','',tutorialText(session.chapter.intro))])],[[copy('始める', 'Start'),()=>{closeDialog();ready=true;flow();},true]]);
    }
    function back() {
        clearTimeout(timer);
        // A chapter opened from the list returns to that entry, without making Back reopen it.
        const from = document.referrer ? new URL(document.referrer) : null;
        if (from?.origin===location.origin && from.pathname === pickerHref() && !from.searchParams.has('chapter')) history.back();
        else location.replace(tutorialPageUrl(pickerHref()));
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
    const notes = el('ul', 'kt-result-note kt-han-breakdown');
    const language = activeTableLanguage();
    notes.lang = language;
    notes.setAttribute('aria-label', language === 'en' ? 'Han breakdown' : '翻の内訳');
    notes.append(...settlementHanBreakdown(match, result).map(entry => el('li', '', formatHanEntry(entry, language))));
    const head = el('p', 'kt-result-head');
    const names = tutorialNames(language);
    head.append(el('strong', '', copy(`${NAMES[w]} の上がり`, w === ME ? 'You went out' : `${names[w]} went out`)), el('span', 'kt-han-pill kt-han-pill-big', formatScoreHan(result.winnerHan, language)));
    const out = [head, notes];
    for (const pay of result.payments) {
        const extra = [];
        if (pay.aces) extra.push(copy(`A${pay.aces}枚 +${pay.aces * rules.aceHan}`, `${pay.aces} ${pay.aces === 1 ? 'Ace' : 'Aces'} +${pay.aces * rules.aceHan}`));
        if (round.dealer === pay.from) extra.push(copy(`親 +${rules.dealerHan}`, `Dealer +${rules.dealerHan}`));
        const text = el('p', 'kt-result-row', copy(
            `${NAMES[pay.from]}：${pay.cards}枚 × ${pay.han}翻${extra.length ? `（${extra.join('、')}）` : ''} × ${rules.cardRate} ＝ `,
            `${names[pay.from]}: ${pay.cards} ${pay.cards === 1 ? 'card' : 'cards'} × ${formatScoreHan(pay.han, 'en')}${extra.length ? ` (${extra.join(', ')})` : ''} × ${rules.cardRate} = `
        ));
        text.append(el('strong', 'kt-chip', String(pay.paid)));
        out.push(text);
    }
    return out;
}

function roleTable() {
    const rows = [['ストレート', '2翻（ハイ：3翻）'], ['フラッシュ', '2翻（ハイ：3翻）'], ['フルハウス', '3翻（ハイ：4翻）'], ['フォーカード', '4翻'], ['エレメンタル', '10翻'], ['ザ・ワールド', '5翻（ハイ：15翻）'],
        ['ファイブカード', '10翻（ハイ：15翻）'], ['ストレートフラッシュ', '5翻'], ['ハイエレメンタル', '12翻'], ['ロイヤルストレートフラッシュ', '10翻']];

    const englishHan = ['2 han (high: 3 han)', '2 han (high: 3 han)', '3 han (high: 4 han)', '4 han', '10 han', '5 han (high: 15 han)', '10 han (high: 15 han)', '5 han', '12 han', '10 han'];
    const table = el('table', 'tt-table-han');
    table.append(el('caption', 'kt-dialog-label', copy('5枚役で場を流したときの翻（弱い順）', 'Han earned for clearing with a five-card hand (weakest first)')));
    const body = el('tbody');
    for (const [index, [name, han]] of rows.entries()) {
        const row = el('tr');
        const th = el('th', '', localizedLabel(name, activeTableLanguage()));
        th.scope = 'row';
        row.append(th, el('td', '', copy(han, englishHan[index])));
        body.append(row);
    }
    table.append(body);
    const notes = el('ul', 'tt-rules');
    notes.append(el('li', '', copy('コールで作った役は1翻少なくなります。', 'A hand made with Call earns 1 less han.')),
        el('li', '', copy('大札0（愚者）は5枚役で好きな数字の代わりになります。', 'The Fool (Major 0) is wild in a five-card hand.')),
        el('li', '', copy('エレメンタルは小札Aを4枚ともう1枚。悪魔15ならハイファイブカードです。', 'Elemental uses all four Minor Aces plus any other card. Add The Devil (15) for High Five of a Kind.')),
        el('li', '', copy('ハイエレメンタルは大札16〜19ともう1枚の大札。世界21ならハイワールドです。', 'High Elemental uses Majors 16–19 plus another Major. Add The World (21) for High World.')));
    const wrap = el('div');
    wrap.append(table, notes);
    return wrap;
}

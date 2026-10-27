const { test, expect } = require('@playwright/test');
const { loadTables, collectGeneratedReadings, collectGeneratedThreeCardReadings, parseStaffSections } = require('../scripts/audit-tarot-readings');
const { buildTarotReadingLineMessage } = require('../server/tarotReading');

const tables = loadTables();
const card = (id) => tables.allCards.find((entry) => entry.id === id);
const topic = (id) => tables.TOPICS.find((entry) => entry.id === id);
const selections = (...ids) => ids.map((id) => ({ card: card(id), orientation: 'upright' }));

function readings(topicId, subtopicId, spread) {
  const positions = tables.getThreeCardSpreadFrame(topicId, subtopicId);
  return spread.map((selection, index) => tables.getThreeCardPositionReading(
    topic(topicId), subtopicId, selection, positions[index], index
  ));
}

test('LINE warns about an adverse destination even when the decision card is favorable', () => {
  const text = tables.buildThreeCardLineReading(topic('future'), selections('major-19', 'major-21', 'major-16'), 'choice');
  expect(text).toContain('今の流れを続けた時の警告');
  expect(text).toContain('選んだ先の警告を軽く見るな。');
  expect(text).toContain('条件と選び方を見直しな');
  expect(text).not.toMatch(/その選び方が、船を「崩壊・発覚」へ運ぶ/);
});

test('all 480480 LINE closings respect the position and outcome polarity', () => {
  // 全相談・全カード・正逆位置を二枚目と三枚目に置き、締め文の分岐を網羅する。
  const failures = [];
  let count = 0;
  const questions = tables.TOPICS.flatMap((entry) => entry.subtopics.map((subtopic) => [entry.id, subtopic.id]));
  for (const [topicId, subtopicId] of questions) {
    const positions = tables.getThreeCardSpreadFrame(topicId, subtopicId);
    const candidates = tables.allCards.flatMap((entry) => ['upright', 'reversed'].map((orientation) => ({ card: entry, orientation })));
    const byPosition = [1, 2].map((index) => candidates.map((selection) => ({
      id: selection.card.id,
      reading: tables.getThreeCardPositionReading(topic(topicId), subtopicId, selection, positions[index], index)
    })));
    for (const second of byPosition[0]) {
      for (const third of byPosition[1]) {
        if (second.id === third.id) continue;
        count += 1;
        const text = tables.buildThreeCardLineClosing([null, second.reading, third.reading], '');
        const identity = `${topicId}:${second.id}:${third.id}:${third.reading.tone}`;
        if (!text) failures.push(`${identity}:empty`);
        if (third.reading.role === 'outcome' && third.reading.tone === 'difficult') {
          if (/へ運ぶ|船は[^。]*へ向かう|次の足場になる|そのまま現実になる|迷わず/.test(text)) failures.push(`${identity}:encouragement`);
          if (!/警告|見直し|かねん/.test(text)) failures.push(`${identity}:missing-warning`);
        }
        if (subtopicId === 'feelings') {
          if (!text.includes('決めつけるな')) failures.push(`${identity}:hidden-feeling-assertion`);
          if (text.includes('獲物へ舵を絞りな')) failures.push(`${identity}:outcome-as-action`);
        }
      }
    }
  }
  expect(count).toBe(480480);
  expect(failures).toEqual([]);
});

test('a bright destination is not described using the aggregate storm forecast', () => {
  const spread = selections('major-16', 'major-15', 'major-19');
  const text = tables.buildThreeCardStaffReading(topic('future'), spread, 'near');
  const sections = parseStaffSections(text);
  expect(sections['結論']).toContain('荒天');
  expect(sections['近未来']).toContain('好機が重なり');
  expect(sections['近未来']).toContain('着地点には「成功・生命力」へ向かう可能性');
  expect(sections['近未来']).not.toContain('予定の変更や損');
});

test('an adverse destination overrides an otherwise bright near-future forecast', () => {
  const text = tables.buildThreeCardStaffReading(topic('future'), selections('major-19', 'major-21', 'major-16'), 'choice');
  const forecast = parseStaffSections(text)['近未来'];
  expect(forecast).toContain('確認をしないまま決めると');
  expect(forecast).toContain('「崩壊・発覚」が問題');
  expect(forecast).not.toMatch(/成果につながります|納得して動き出せます/);
});

test('a recovery card in the obstacle position does not promise recovery in the synthesis', () => {
  const spread = selections('major-1', 'major-20', 'major-19');
  const positions = tables.getThreeCardSpreadFrame('future', 'near');
  const pattern = tables.getThreeCardPattern(spread, positions);
  expect(pattern.tags.recovery).toBe(0);
  expect(pattern.staff).not.toContain('回復を示す札');
  const text = tables.buildThreeCardStaffReading(topic('future'), spread, 'near');
  expect(text).not.toContain('回復を示す札');
});

test('action cards describe a condition rather than guaranteeing a future recovery', () => {
  const text = tables.buildThreeCardStaffReading(topic('work'), selections('major-16', 'major-15', 'major-19'), 'current');
  expect(text).toContain('最後の札には使える要素があります');
  expect(text).not.toContain('最後に回復します');
});

test('all single-card LINE messages survive the send formatter unchanged and avoid false claims', () => {
  for (const entry of collectGeneratedReadings(tables)) {
    const identity = `${entry.topicId}:${entry.subtopicId}:${entry.loc}:${entry.orientation}`;
    expect(entry.lineText.length, identity).toBeLessThanOrEqual(3200);
    expect(buildTarotReadingLineMessage({ resultText: entry.lineText }), identity).toBe(entry.lineText);
    const selectedCard = card(entry.loc);
    const orientationLabel = entry.orientation === 'reversed' ? '逆位置' : '正位置';
    expect(entry.lineText.split(/\n{2,}/)[2], identity).toBe(`【${topic(entry.topicId).label}・${entry.subtopicLabel}】${selectedCard.label}（${orientationLabel}）`);
    expect(entry.lineText, identity).not.toMatch(/９割|9割|パラノイア|誰が(?:本当の)?(?:裏切り者|犯人)|二股をかけたり|\{keywords\}/);
    if (entry.topicId === 'love' && entry.subtopicId === 'feelings') {
      expect(entry.lineBody, identity).toContain('相手の気持ち');
      expect(entry.lineBody, identity).not.toMatch(/遭難志願|次の獲物|時間の無駄|二人の関係は最悪の底/);
    }
    if (entry.topicId === 'love' && ['direction', 'reconciliation', 'commitment'].includes(entry.subtopicId)) {
      expect(entry.lineBody, identity).not.toMatch(/新しい恋|次の獲物|次の恋|恋のライバル/);
    }
  }
});

test('all 156 feelings outcomes add a distinct concrete observation without replacing the captain copy', () => {
  const entries = collectGeneratedReadings(tables).filter((entry) => entry.topicId === 'love' && entry.subtopicId === 'feelings');
  const notes = entries.map((entry) => entry.lineBody.match(/[^。！？!?]+[。！？!?]?/g)?.[1]);
  expect(entries).toHaveLength(156);
  expect(notes.every((note) => note && note.length >= 20 && note.length <= 90)).toBe(true);
  expect(new Set(notes).size).toBe(156);
  const sun = entries.find((entry) => entry.loc === 'major-19' && entry.orientation === 'upright');
  const priestess = entries.find((entry) => entry.loc === 'major-2' && entry.orientation === 'upright');
  expect(sun.lineBody).toContain('相手からも会話や誘いを広げるか');
  expect(priestess.lineBody).toContain('静かな気遣いや話を覚えている様子');
  for (const entry of entries) {
    expect(entry.lineBody).toMatch(/^相手の気持ち/);
    expect(entry.lineBody).toMatch(/見な。|確かめるんだ。|見届けな。/);
    expect(entry.lineText).toContain(entry.lineBody.match(/[^。！？!?]+[。！？!?]?/g)[0]);
  }
});

test('hidden feelings remain observations in the LINE closing', () => {
  const spread = selections('major-0', 'major-14', 'major-19');
  const positionReadings = readings('love', 'feelings', spread);
  expect(positionReadings[2].role).toBe('outcome');
  const text = tables.buildThreeCardLineReading(topic('love'), spread, 'feelings');
  expect(text).toContain('相手が次に見せる行動で確かめな');
  expect(text).not.toContain('最後の札が示す獲物');
});

test('three-card copy explains the card meaning and joins the spread without keyword-list grammar', () => {
  const text = tables.buildThreeCardLineReading(topic('work'), selections('wand-5', 'wand-6', 'wand-10'), 'evaluation');
  expect(text).toContain('競争や意見の衝突が、立場と実力を試している。');
  expect(text).toContain('称賛を実力の保証だと思うと、次の結果を出す準備が止まる。');
  expect(text).toContain('任せる・止める・後へ回す');
  expect(text).toContain('三枚を合わせると');
  expect(text).toContain('次に任されるための条件を一つ聞く');
  expect(text).not.toMatch(/「[^」]*・[^」]*」(?:を外し|へ向かう|を活かしな|の問題を整えな)|です。|ます。|ください。/);
});

test('a card in the release position is not narrated as a favorable starting state', () => {
  const spread = selections('major-19', 'major-21', 'major-16');
  const line = tables.buildThreeCardLineReading(topic('future'), spread, 'choice');
  const staff = tables.buildThreeCardStaffReading(topic('future'), spread, 'choice');
  expect(line).toContain('何を手放すか、何を基準に選ぶか');
  expect(line).not.toContain('出だしの良さ');
  expect(staff).toContain('一枚目を現在の好調さと取り違えず');
});

test('selected facts replace the default action without changing the card or wind', () => {
  const selected = card('major-19');
  const bundle = {
    staffText: tables.buildStaffReading(topic('love'), selected, 'upright', 'feelings'),
    lineText: tables.buildLineReading(selected, 'upright', tables.getSpecialReadingBody('love', selected, 'upright'), topic('love'), 'feelings')
  };
  const result = tables.applyReadingSituation(bundle, 'love', 'feelings', 'contact_stopped');
  expect(result.lineText).toContain('聞かせてもらった今の状況：今は連絡が途切れている');
  expect(result.lineText).toContain('すでに連絡したなら重ねず');
  expect(result.lineText).not.toContain('短い誘いを一度だけ出しな');
  expect(result.lineText.split(/\n{2,}/).slice(0, 3)).toEqual(bundle.lineText.split(/\n{2,}/).slice(0, 3));
  expect(parseStaffSections(result.staffText)['対策']).toContain('追いかける前に待つ範囲');
  expect(tables.applyReadingSituation(bundle, 'love', 'feelings', 'unrecognized')).toEqual(bundle);
  expect(tables.applyReadingSituation(bundle, 'love', 'encounter', 'contact_stopped')).toEqual(bundle);
});

test('all 40 situations produce complete untruncated single and triple LINE messages', () => {
  const entries = [...collectGeneratedReadings(tables), ...collectGeneratedThreeCardReadings(tables)];
  const failures = [];
  let checked = 0;
  const situations = tables.TOPICS.flatMap((entry) => entry.subtopics.flatMap((subtopic) => tables.READING_CONSULTATIONS[entry.id][subtopic.id].situations));
  expect(situations).toHaveLength(40);
  for (const entry of entries) {
    const definition = tables.READING_CONSULTATIONS[entry.topicId][entry.subtopicId];
    for (const situation of definition.situations) {
      const bundle = tables.applyReadingSituation({ staffText: entry.staffText, lineText: entry.lineText }, entry.topicId, entry.subtopicId, situation.id);
      checked += 1;
      const identity = `${entry.topicId}:${entry.subtopicId}:${situation.id}`;
      if (bundle.lineText.length > 3200) failures.push(`${identity}:truncated`);
      if (buildTarotReadingLineMessage({ resultText: bundle.lineText }) !== bundle.lineText) failures.push(`${identity}:send-mismatch`);
      if (!bundle.lineText.includes(situation.label)) failures.push(`${identity}:missing-fact`);
      if (bundle.lineText.includes(definition.next)) failures.push(`${identity}:default-action`);
      if (!bundle.staffText.includes(`対策: ${situation.staff}`)) failures.push(`${identity}:missing-adapted-action`);
      if (/undefined|\{[a-z]+\}|[、・]。/.test(bundle.lineText)) failures.push(`${identity}:broken-copy`);
    }
  }
  expect(checked).toBe(24960);
  expect(failures).toEqual([]);
});

test('captain prose keeps irregular verbs and negative forms grammatical', () => {
  expect(tables.makeCaptainReadingText('選択肢が見えてきます。足場を失います。信用が残りません。話せません。')).toBe('選択肢が見えてくる。足場を失う。信用が残らん。話せない。');
  expect(tables.makeCaptainReadingText('焦って選ばないでください。約束を確認してください。')).toBe('焦って選ばないことだ。約束を確認しな。');
});

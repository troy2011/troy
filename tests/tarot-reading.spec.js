const { test, expect } = require('@playwright/test');
const { buildTarotReadingLineMessage } = require('../server/tarotReading');

test('LINE message contains only the generated wind and Barbossa copy', () => {
  const resultText = '風向き: 安定\n\nお前さん、舵を切りな。';
  expect(buildTarotReadingLineMessage({
    resultText,
    topicLabel: '恋愛',
    cardLabel: '愚者',
    staffName: '表示しない',
    note: '表示しない'
  })).toBe(resultText);
});

test('store tarot separates the spoken reading from the Barbossa LINE message', async ({ page }) => {
  const sendRequests = [];

  await page.addInitScript(() => {
    window.liff = {
      init: async () => {},
      isInClient: () => true,
      scanCodeV2: async () => ({ value: 'TROY:CUSTOMER123' })
    };
  });

  await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });

  await page.route('**/api/tarot-reading/send', async (route) => {
    sendRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, sent: true, readingId: 'tarot-test', lineUserIdMasked: 'U1234...abcd' })
    });
  });

  await page.goto('/tarot-reading.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.TarotReadingApp?.buildStaffReading);

  await expect(page.locator('h1')).toHaveText('タロット航路');
  await expect(page.locator('#tarotTopicList [data-topic-id]')).toHaveCount(4);
  await expect(page.locator('#tarotTopicList [data-topic-id="love"]')).toHaveClass(/is-active/);
  await expect(page.locator('#tarotSubtopicList [data-subtopic-id]')).toHaveCount(5);
  await expect(page.locator('#tarotSubtopicList [data-subtopic-id="feelings"]')).toHaveClass(/is-active/);
  await expect(page.locator('#tarotReadingNote')).toHaveCount(0);

  await page.locator('#tarotStaffName').fill('ミナト');
  await page.locator('#tarotStaffPin').fill('2468');
  await page.locator('#tarotScanCustomer').click();
  await expect(page.locator('#tarotCustomerRef')).toHaveValue('TROY:CUSTOMER123');

  await page.locator('[data-card-id="major-0"]').click();
  await expect(page.locator('#tarotSelectedMeta')).toHaveText('大アルカナ / 自由、始まり / 正位置');
  await expect(page.locator('#tarotWeatherLevel')).toHaveText('風向き');
  await expect(page.locator('#tarotWeatherTitle')).toHaveText('安定');

  const staffReading = page.locator('#tarotStaffReadingText');
  await expect(staffReading).toContainText('【恋愛・相手の気持ち鑑定】愚者 / 正位置');
  await expect(staffReading).toContainText('このカードが持つ意味は、相手の気持ちに表れる「自由・始まり」です。');
  await expect(staffReading).toContainText('今の状態: 二人を動かす根本の感情と、相手が選ぼうとしている方向を見ます。');
  await expect(staffReading).toContainText('港を出たい気持ちはあるが');
  await expect(staffReading).toContainText('すすめる行動: 本音を確かめるには、次に相手が自分から選ぶ行動を一つだけ決め');
  await expect(staffReading).not.toContainText('お前さん');
  await expect(staffReading).not.toContainText('船長からの一言');

  const linePreview = page.locator('#tarotResultText');
  await expect(linePreview).toHaveAttribute('readonly', '');
  await expect(linePreview).toHaveValue(/^風向き: 安定\n\n相手の腹の底を読むなら/);
  await expect(linePreview).toHaveValue(/何の計画も勝算もなしに/);
  await expect(linePreview).toHaveValue(/愛が味方してくれるとでも/);
  await expect(linePreview).not.toHaveValue(/恋愛鑑定|このカードの意味|結論:|現在地:|次の一手:|禁じ手:|一言判定|船長からの一言/);

  const feelingsStaffText = await staffReading.innerText();
  const feelingsLineText = await linePreview.inputValue();
  await page.locator('#tarotSubtopicList [data-subtopic-id="direction"]').click();
  await expect(staffReading).toContainText('【恋愛・関係の行方鑑定】愚者 / 正位置');
  await expect(staffReading).toContainText('このカードが持つ意味は、二人の関係の行方を左右する「自由・始まり」です。');
  await expect(linePreview).toHaveValue(/^風向き: 安定\n\nこの関係がどこへ流れるかは/);
  expect(await staffReading.innerText()).not.toBe(feelingsStaffText);
  expect(await linePreview.inputValue()).not.toBe(feelingsLineText);

  await page.locator('#tarotTopicList [data-topic-id="relation"]').click();
  await expect(page.locator('#tarotSubtopicList [data-subtopic-id="friends"]')).toHaveClass(/is-active/);
  await page.locator('#tarotDeckTabs [data-deck-id="sword"]').click();
  await page.locator('[data-card-id="sword-7"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(staffReading).toContainText('【人間関係・友人・仲間鑑定】ソード 7 / 逆位置');
  await expect(staffReading).toContainText('このカードが持つ意味は、友人や仲間との信頼に表れる「露見・不誠実」です。');
  await expect(staffReading).toContainText('今の状態: 言葉の行き違い、裏切り、境界線を見ます。');
  await expect(staffReading).toContainText('言葉・境界線・対立の面では、隠していたことが表に出やすい。');
  await expect(staffReading).toContainText('すすめる行動: 信頼を深めるには、露見する前提で');
  await expect(linePreview).toHaveValue(/最悪中の最悪のタイミング/);
  await expect(linePreview).not.toHaveValue(/売上|案件|恋愛|恋人/);

  await page.locator('#tarotTopicList [data-topic-id="future"]').click();
  await page.locator('#tarotSubtopicList [data-subtopic-id="goal"]').click();
  await page.locator('#tarotDeckTabs [data-deck-id="pentacle"]').click();
  await page.locator('[data-card-id="pentacle-8"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(staffReading).toContainText('【将来・目標の実現鑑定】ペンタクル 8 / 正位置');
  await expect(staffReading).toContainText('このカードが持つ意味は、目標の実現条件を示す「努力・熟練」です。');
  await expect(staffReading).toContainText('今の状態: 必要な技能、資源、継続量、成果の積み上げを見ます。');
  await expect(staffReading).toContainText('生活基盤や長期的な準備では、地道な継続が力になる。');
  await expect(staffReading).toContainText('すすめる行動: 達成へ近づくには、伸ばす技能を一つに絞り');
  await expect(linePreview).toHaveValue(/一攫千金のハッタリ/);

  const exhaustive = await page.evaluate(() => {
    const app = window.TarotReadingApp;
    const forbiddenLine = ['このカードの意味', '結論:', '現在地:', '次の一手:', '禁じ手:', '一言判定', '船長からの一言', '船長の結び', 'スタッフ補助'];
    const entries = [];
    for (const topic of app.topics) {
      for (const subtopic of topic.subtopics) {
        for (const card of app.allCards) {
          for (const orientation of ['upright', 'reversed']) {
            const source = app.getSpecialReadingBody(topic.id, card, orientation);
            const staff = app.buildStaffReading(topic, card, orientation, subtopic);
            const line = app.buildLineReading(card, orientation, source, topic, subtopic);
            entries.push({ topic: topic.id, subtopic: subtopic.id, card: card.id, orientation, source, staff, line });
          }
        }
      }
    }
    const sections = entries.map((entry) => {
      const parsed = {};
      entry.staff.split(/\n{2,}/).forEach((section) => {
        const separatorIndex = section.indexOf(':');
        if (separatorIndex > 0) parsed[section.slice(0, separatorIndex)] = section.slice(separatorIndex + 1).trim();
      });
      return { ...entry, parsed };
    });
    const minorStates = new Map();
    sections.filter((entry) => !entry.card.startsWith('major-')).forEach((entry) => {
      const key = `${entry.card}:${entry.orientation}`;
      if (!minorStates.has(key)) minorStates.set(key, new Set());
      minorStates.get(key).add(entry.parsed['今の状態']);
    });
    return {
      count: entries.length,
      missing: entries.filter((entry) => !entry.source || !entry.staff || !entry.line).length,
      lineMixed: entries.filter((entry) => forbiddenLine.some((word) => entry.line.includes(word))).length,
      badLineFormat: entries.filter((entry) => !/^風向き: [^\n]+\n\n[^\n]/.test(entry.line)).length,
      staffVoiceLeaks: entries.filter((entry) => /お前さん|ククク|船長からの一言/.test(entry.staff)).length,
      todayLeaks: entries.filter((entry) => entry.staff.includes('今日') || entry.line.includes('今日')).length,
      badStaffFormat: entries.filter((entry) => entry.staff.split(/\r?\n/).filter(Boolean).length !== 6).length,
      placeholderLeaks: entries.filter((entry) => /\{[a-z]+\}/.test(entry.staff)).length,
      minorStateCollisions: [...minorStates.values()].filter((values) => values.size !== 20).length,
      uniquePoints: new Set(sections.map((entry) => entry.parsed['鑑定の要点'])).size,
      uniqueActions: new Set(sections.map((entry) => entry.parsed['すすめる行動'])).size,
      uniqueCautions: new Set(sections.map((entry) => entry.parsed['注意点'])).size
    };
  });
  expect(exhaustive).toMatchObject({
    count: 3120,
    missing: 0,
    lineMixed: 0,
    badLineFormat: 0,
    staffVoiceLeaks: 0,
    todayLeaks: 0,
    badStaffFormat: 0,
    placeholderLeaks: 0,
    minorStateCollisions: 0
  });
  expect(exhaustive.uniquePoints).toBeGreaterThanOrEqual(3000);
  expect(exhaustive.uniqueActions).toBeGreaterThanOrEqual(3000);
  expect(exhaustive.uniqueCautions).toBeGreaterThanOrEqual(3000);

  const semanticSamples = await page.evaluate(() => {
    const app = window.TarotReadingApp;
    const card = (id) => app.allCards.find((entry) => entry.id === id);
    return {
      weather: {
        cup4Reversed: app.getWeatherStatus(card('cup-4'), 'reversed'),
        cup5Reversed: app.getWeatherStatus(card('cup-5'), 'reversed'),
        cup7Reversed: app.getWeatherStatus(card('cup-7'), 'reversed'),
        sword8Reversed: app.getWeatherStatus(card('sword-8'), 'reversed'),
        sword10Upright: app.getWeatherStatus(card('sword-10'), 'upright'),
        sword10Reversed: app.getWeatherStatus(card('sword-10'), 'reversed')
      },
      loveCupKnight: app.getSpecialReadingBody('love', card('cup-knight'), 'upright'),
      workCupKnightReversed: app.getSpecialReadingBody('work', card('cup-knight'), 'reversed'),
      relationCupQueen: app.getSpecialReadingBody('relation', card('cup-queen'), 'upright')
    };
  });
  expect(semanticSamples.weather).toEqual({
    cup4Reversed: { level: 7, windLabel: '追い風' },
    cup5Reversed: { level: 6, windLabel: '安定' },
    cup7Reversed: { level: 7, windLabel: '追い風' },
    sword8Reversed: { level: 7, windLabel: '追い風' },
    sword10Upright: { level: 1, windLabel: '最悪' },
    sword10Reversed: { level: 6, windLabel: '安定' }
  });
  expect(semanticSamples.loveCupKnight).toContain('告白、誘い、歩み寄り');
  expect(semanticSamples.loveCupKnight).not.toContain('冷静さでねじ伏せ');
  expect(semanticSamples.workCupKnightReversed).toContain('期限までに何を出すか');
  expect(semanticSamples.relationCupQueen).toContain('言葉にならない感情');

  await page.locator('#tarotTopicList [data-topic-id="work"]').click();
  await page.locator('#tarotSubtopicList [data-subtopic-id="business"]').click();
  await page.locator('#tarotDeckTabs [data-deck-id="major"]').click();
  await page.locator('[data-card-id="major-16"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(staffReading).toContainText('【仕事・独立・事業鑑定】塔 / 逆位置');
  await expect(staffReading).toContainText('このカードが持つ意味は、独立や事業の勝算を示す「余波・警告」です。');
  await expect(staffReading).toContainText('すすめる行動: 勝算を形にするには、まだ残る火種を一つ特定し');
  await expect(linePreview).toHaveValue(/^風向き: 荒天\n\n自分の旗を掲げるなら/);
  await expect(linePreview).toHaveValue(/致命傷は免れたようだが/);

  await page.locator('#tarotSendLine').click();
  await expect.poll(() => sendRequests.length).toBe(1);
  expect(sendRequests[0]).toMatchObject({
    customerRef: 'TROY:CUSTOMER123',
    staffPin: '2468',
    staffName: 'ミナト',
    topicId: 'work',
    topicLabel: '仕事',
    subtopicId: 'business',
    subtopicLabel: '独立・事業',
    cardId: 'major-16',
    cardLabel: '塔',
    orientation: 'reversed',
    orientationLabel: '逆位置'
  });
  expect(sendRequests[0]).not.toHaveProperty('note');
  expect(sendRequests[0].resultText).toMatch(/^風向き: 荒天\n\n自分の旗を掲げるなら/);
  expect(sendRequests[0].resultText).toContain('致命傷は免れたようだが');
  expect(sendRequests[0].resultText).toContain('大炎上の余波');
  expect(sendRequests[0].resultText).not.toMatch(/仕事鑑定|このカードの意味|結論:|船長からの一言|船長の結び/);
  await expect(page.locator('#tarotReadingStatus')).toContainText('送信済み');
});

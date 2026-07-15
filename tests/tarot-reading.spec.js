const { test, expect } = require('@playwright/test');
const {
  buildTarotReadingLineMessage,
  getStoreTarotCustomers,
  initializeTarotReadingRoutes,
  normalizeReadingCards
} = require('../server/tarotReading');

const STORE_CUSTOMERS_RESPONSE = {
  success: true,
  isOpen: true,
  customers: [
    { customerRef: 'TROY:CUSTOMER123', displayName: 'アン', joinedAtMs: 1760000000000, lineLinked: true },
    { customerRef: 'TROY:NO_LINE', displayName: 'ボブ', joinedAtMs: 1760003600000, lineLinked: false }
  ]
};

async function mockStoreCustomers(page) {
  await page.route('**/api/tarot-reading/customers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(STORE_CUSTOMERS_RESPONSE)
    });
  });
}

test('LINE message contains only the generated wind and Barbossa copy', () => {
  const resultText = '風向き: 安定\n\nお前さん、舵を切りな。';
  expect(buildTarotReadingLineMessage({
    resultText,
    topicLabel: '恋愛',
    cardLabel: '愚者',
    note: '表示しない'
  })).toBe(resultText);
});

test('three-card payload data is sanitized without breaking legacy single-card data', () => {
  expect(normalizeReadingCards([
    { position: 1, positionId: 'base', positionLabel: '土台', cardId: 'major-0', cardLabel: '愚者', orientation: 'upright', orientationLabel: '正位置' },
    { position: 2, positionId: 'risk', positionLabel: '障害', cardId: 'major-16', cardLabel: '塔', orientation: 'reversed', orientationLabel: '逆位置' },
    { position: 3, positionId: 'result', positionLabel: '結果', cardId: 'major-20', cardLabel: '審判', orientation: 'upright', orientationLabel: '正位置' },
    { position: 4, cardId: 'ignored', cardLabel: '除外' }
  ])).toEqual([
    { position: 1, positionId: 'base', positionLabel: '土台', cardId: 'major-0', cardLabel: '愚者', orientation: 'upright', orientationLabel: '正位置' },
    { position: 2, positionId: 'risk', positionLabel: '障害', cardId: 'major-16', cardLabel: '塔', orientation: 'reversed', orientationLabel: '逆位置' },
    { position: 3, positionId: 'result', positionLabel: '結果', cardId: 'major-20', cardLabel: '審判', orientation: 'upright', orientationLabel: '正位置' }
  ]);
  expect(normalizeReadingCards(null, {
    cardId: 'major-0', cardLabel: '愚者', orientation: 'upright', orientationLabel: '正位置'
  })).toMatchObject([{ cardId: 'major-0', cardLabel: '愚者', orientation: 'upright' }]);
});

test('store customer list marks LINE-linked guests without exposing LINE IDs', async () => {
  const memberDocs = [
    { id: 'CUSTOMER123', data: () => ({ displayName: 'アン', joinedAt: { toMillis: () => 1760000000000 } }) },
    { id: 'NO_LINE', data: () => ({ displayName: 'ボブ', joinedAt: { toMillis: () => 1760003600000 } }) }
  ];
  const roomRef = {
    get: async () => ({ data: () => ({ isOpen: true }) }),
    collection(name) {
      expect(name).toBe('members');
      return {
        orderBy() { return this; },
        limit() { return this; },
        get: async () => ({ docs: memberDocs })
      };
    }
  };
  const firestore = {
    collection(name) {
      if (name === 'troy_rooms') return { doc: () => roomRef };
      if (name === 'line_user_links') {
        return {
          where(field, operator, values) {
            expect([field, operator]).toEqual(['playFabId', 'in']);
            expect(values).toEqual(['CUSTOMER123', 'NO_LINE']);
            return {
              get: async () => ({ docs: [{ id: 'U-secret', data: () => ({ playFabId: 'CUSTOMER123' }) }] })
            };
          }
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }
  };

  await expect(getStoreTarotCustomers({ firestore })).resolves.toEqual({
    isOpen: true,
    customers: [
      { customerRef: 'TROY:CUSTOMER123', displayName: 'アン', joinedAtMs: 1760000000000, lineLinked: true },
      { customerRef: 'TROY:NO_LINE', displayName: 'ボブ', joinedAtMs: 1760003600000, lineLinked: false }
    ]
  });
});

test('three-card API rejects incomplete or duplicated spreads before sending LINE', async () => {
  let handler;
  let statusCode = 200;
  let responseBody;
  let pushCount = 0;
  const app = {
    get() {},
    post(path, routeHandler) {
      if (path === '/api/tarot-reading/send') handler = routeHandler;
    }
  };
  initializeTarotReadingRoutes(app, {
    lineClient: { pushMessage: async () => { pushCount += 1; } }
  });
  const res = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return value;
    }
  };
  await handler({
    body: {
      spreadMode: 'triple',
      resultText: '風向き: 安定\n\n本文',
      cards: [
        { cardId: 'major-0', cardLabel: '愚者' },
        { cardId: 'major-0', cardLabel: '愚者' }
      ]
    }
  }, res);
  expect(statusCode).toBe(400);
  expect(responseBody).toEqual({ success: false, error: 'three-card reading requires three unique cards' });
  expect(pushCount).toBe(0);
});

test('send API accepts a current store guest without PIN and rejects direct LINE IDs', async () => {
  let handler;
  let statusCode = 200;
  let responseBody;
  const pushed = [];
  let loggedEntry;
  const app = {
    get() {},
    post(path, routeHandler) {
      if (path === '/api/tarot-reading/send') handler = routeHandler;
    }
  };
  const roomRef = {
    get: async () => ({ data: () => ({ isOpen: true }) }),
    collection(name) {
      if (name !== 'members') throw new Error(`Unexpected room collection: ${name}`);
      return {
        doc(id) {
          return {
            get: async () => ({
              exists: id === 'CUSTOMER123',
              data: () => ({ displayName: 'アン' })
            })
          };
        }
      };
    }
  };
  const firestore = {
    collection(name) {
      if (name === 'troy_rooms') return { doc: () => roomRef };
      if (name === 'tarot_reading_logs') {
        return {
          doc: () => ({
            set: async (entry) => { loggedEntry = entry; }
          })
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }
  };
  initializeTarotReadingRoutes(app, {
    firestore,
    PlayFabServer: { GetUserReadOnlyData() {} },
    promisifyPlayFab: async () => ({ Data: { lineUserId: { Value: `U${'a'.repeat(32)}` } } }),
    lineClient: { pushMessage: async (...args) => { pushed.push(args); } }
  });
  const res = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return value;
    }
  };
  const readingBody = {
    resultText: '風向き: 安定\n\n本文',
    cardId: 'major-0',
    cardLabel: '愚者',
    orientation: 'upright',
    orientationLabel: '正位置'
  };

  await handler({ body: { ...readingBody, customerRef: `LINE:U${'b'.repeat(32)}` } }, res);
  expect(statusCode).toBe(400);
  expect(responseBody.error).toContain('店内リスト');
  expect(pushed).toHaveLength(0);

  statusCode = 200;
  responseBody = null;
  await handler({ body: { ...readingBody, customerRef: 'TROY:CUSTOMER123' } }, res);
  expect(statusCode).toBe(200);
  expect(responseBody).toMatchObject({ success: true, sent: true });
  expect(pushed).toEqual([[`U${'a'.repeat(32)}`, { type: 'text', text: readingBody.resultText }]]);
  expect(loggedEntry).toMatchObject({
    customerRef: 'TROY:CUSTOMER123',
    customerDisplayName: 'アン',
    playFabId: 'CUSTOMER123'
  });
  expect(loggedEntry).not.toHaveProperty('staffPin');
});

test('customer list load failure shows a staff-friendly message', async ({ page }) => {
  await page.route('**/api/tarot-reading/customers', async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: 'Not found' });
  });
  await page.goto('/tarot-reading.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tarotCustomerListStatus')).toHaveText('店内リストを読み込めませんでした');
  await expect(page.locator('#tarotCustomerRef')).toBeDisabled();
});

test('three-card reading uses dedicated positions, synthesis, and structured LINE payload', async ({ page }) => {
  const sendRequests = [];
  await mockStoreCustomers(page);
  await page.route('**/api/tarot-reading/send', async (route) => {
    sendRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, sent: true, readingId: 'tarot-three', lineUserIdMasked: 'U1234...abcd' })
    });
  });

  await page.goto('/tarot-reading.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.TarotReadingApp?.buildThreeCardStaffReading);
  await page.locator('[data-spread-mode="triple"]').click();
  await expect(page.locator('[data-spread-mode="triple"]')).toHaveClass(/is-active/);
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot]')).toHaveCount(3);
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot="0"]')).toContainText('表に出ている気持ち');
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot="1"]')).toContainText('隠している本音');
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot="2"]')).toContainText('次に見せる行動');

  await page.locator('[data-card-id="major-0"]').click();
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot="0"]')).toContainText('愚者');
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot="1"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-card-id="major-0"]')).toBeDisabled();

  await page.locator('[data-orientation="reversed"]').click();
  await page.locator('[data-card-id="major-16"]').click();
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot="1"]')).toContainText('塔');
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot="1"]')).toContainText('逆位置');
  await expect(page.locator('#tarotSpreadSlots [data-spread-slot="2"]')).toHaveClass(/is-active/);

  await page.locator('[data-orientation="upright"]').click();
  await page.locator('[data-card-id="major-20"]').click();
  await expect(page.locator('#tarotTriplePreview .tarot-reading-triple-preview-item')).toHaveCount(3);
  await expect(page.locator('#tarotWeatherStatus')).toBeVisible();
  await expect(page.locator('#tarotSendLine')).toBeDisabled();

  const staffReading = page.locator('#tarotStaffReadingText');
  await expect(staffReading).toContainText('【恋愛・相手の気持ち鑑定】3枚引き');
  await expect(staffReading).toContainText('結論: 現在の風向きは');
  await expect(staffReading).toContainText('現状と理由:');
  await expect(staffReading).toContainText('1枚目・表に出ている気持ち: 愚者 / 正位置');
  await expect(staffReading).toContainText('2枚目・隠している本音: 塔 / 逆位置');
  await expect(staffReading).toContainText('3枚目・次に見せる行動: 審判 / 正位置');
  await expect(staffReading).toContainText('近未来:');
  await expect(staffReading).toContainText('対策:');
  await expect(staffReading).toContainText('注意点:');
  await expect(staffReading).not.toContainText('確認すること:');
  await expect(staffReading).not.toContainText('お前さん');

  const linePreview = page.locator('#tarotResultText');
  await expect(linePreview).toHaveValue(/^風向き: [^\n]+\n\n/);
  await expect(linePreview).toHaveValue(/1枚目「表に出ている気持ち」/);
  await expect(linePreview).toHaveValue(/2枚目「隠している本音」/);
  await expect(linePreview).toHaveValue(/3枚目「次に見せる行動」/);
  await expect(linePreview).not.toHaveValue(/結論:|現状と理由:|近未来:|対策:|注意点:/);

  const roleAwareSample = await page.evaluate(() => {
    const app = window.TarotReadingApp;
    const topic = app.topics.find((entry) => entry.id === 'work');
    const card = (id) => app.allCards.find((entry) => entry.id === id);
    const selections = [
      { card: card('wand-5'), orientation: 'upright' },
      { card: card('wand-6'), orientation: 'upright' },
      { card: card('wand-10'), orientation: 'upright' }
    ];
    return {
      staff: app.buildThreeCardStaffReading(topic, selections, 'evaluation'),
      line: app.buildThreeCardLineReading(topic, selections, 'evaluation')
    };
  });
  expect(roleAwareSample.staff).toContain('評価を下げる要因では「勝利・称賛」の行きすぎが弱点になります。');
  expect(roleAwareSample.staff).toContain('「重荷・責任」の問題を先に整えることが、悪化を止める条件です。');
  expect(roleAwareSample.line).toContain('追い風の「勝利・称賛」も、この位置じゃ行きすぎが暗礁になる。');
  expect(roleAwareSample.line).toContain('「勝利・称賛」の行きすぎを外し、「重荷・責任」の問題を整えな。');

  const difficultDecisionSample = await page.evaluate(() => {
    const app = window.TarotReadingApp;
    const topic = app.topics.find((entry) => entry.id === 'future');
    const card = (id) => app.allCards.find((entry) => entry.id === id);
    const selections = [
      { card: card('pentacle-6'), orientation: 'reversed' },
      { card: card('major-14'), orientation: 'reversed' },
      { card: card('cup-2'), orientation: 'upright' }
    ];
    return app.buildThreeCardLineReading(topic, selections, 'choice');
  });
  expect(difficultDecisionSample).toContain('「不摂生・乱れ」だけで決めるな。');
  expect(difficultDecisionSample).toContain('「不摂生・乱れ」だけで決めるな。守る条件を立て直せば');
  expect(difficultDecisionSample).not.toContain('「不摂生・乱れ」を判断の軸にしな。');

  await page.locator('#tarotCustomerRef').selectOption('TROY:CUSTOMER123');
  await expect(page.locator('#tarotSendLine')).toBeEnabled();
  await page.locator('#tarotSendLine').click();
  await expect.poll(() => sendRequests.length).toBe(1);
  expect(sendRequests[0]).toMatchObject({
    spreadMode: 'triple',
    spreadModeLabel: '3枚引き',
    cardId: 'major-0',
    cardLabel: '愚者',
    orientation: 'upright'
  });
  expect(sendRequests[0].cards).toEqual([
    expect.objectContaining({ position: 1, positionLabel: '表に出ている気持ち', cardId: 'major-0', orientation: 'upright' }),
    expect.objectContaining({ position: 2, positionLabel: '隠している本音', cardId: 'major-16', orientation: 'reversed' }),
    expect.objectContaining({ position: 3, positionLabel: '次に見せる行動', cardId: 'major-20', orientation: 'upright' })
  ]);
});

test('store tarot separates the spoken reading from the Barbossa LINE message', async ({ page }) => {
  const sendRequests = [];
  await mockStoreCustomers(page);

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
  await expect(page.locator('#tarotStaffName')).toHaveCount(0);
  await expect(page.locator('#tarotStaffPin')).toHaveCount(0);
  await expect(page.locator('#tarotScanCustomer')).toHaveCount(0);
  await expect(page.locator('#tarotCustomerRef option')).toHaveCount(3);
  await expect(page.locator('#tarotCustomerRef option[value=""]')).toContainText('お客様を選択');
  await expect(page.locator('#tarotCustomerRef option[value="unlinked-2"]')).toHaveAttribute('disabled', '');
  await expect(page.locator('#tarotCustomerRef option[value="unlinked-2"]')).toContainText('LINE未連携');
  await expect(page.locator('#tarotCustomerListStatus')).toContainText('LINE送信可 1名 / 店内 2名 / LINE未連携 1名');
  await page.locator('#tarotCustomerRef').selectOption('TROY:CUSTOMER123');

  await page.locator('[data-card-id="major-0"]').click();
  await expect(page.locator('#tarotSelectedMeta')).toHaveText('大アルカナ / 自由、始まり / 正位置');
  await expect(page.locator('#tarotWeatherLevel')).toHaveText('風向き');
  await expect(page.locator('#tarotWeatherTitle')).toHaveText('安定');

  const staffReading = page.locator('#tarotStaffReadingText');
  await expect(staffReading).toContainText('【恋愛・相手の気持ち鑑定】愚者 / 正位置');
  await expect(staffReading).toContainText('結論: 現在の風向きは安定です。相手の気持ちはまだ固まっていません。');
  await expect(staffReading).toContainText('現状と理由: 相手の気持ちでは「自由・始まり」が強く出ています。');
  await expect(staffReading).toContainText('この気持ちは一時の反応より、相手が最終的に何を選ぶかに表れます。');
  await expect(staffReading).toContainText('近未来: しばらくは曖昧な反応が続きますが、相手の行動が出れば流れは変わります。');
  await expect(staffReading).toContainText('対策: まず、相手の自発的な反応を確かめられる動きに絞ります。次に自分から取る行動を決め');
  await expect(staffReading).toContainText('注意点: 期待を事実に置き換えないことが重要です。');
  await expect(staffReading).not.toContainText('確認すること:');
  await expect(staffReading).not.toContainText('お前さん');
  await expect(staffReading).not.toContainText('船長からの一言');

  const linePreview = page.locator('#tarotResultText');
  await expect(linePreview).toHaveAttribute('readonly', '');
  await expect(linePreview).toHaveValue(/^風向き: 安定\n\n相手の腹はまだ決まっちゃいない。/);
  await expect(linePreview).toHaveValue(/何の計画も勝算もなしに/);
  await expect(linePreview).toHaveValue(/愛が味方してくれるとでも/);
  await expect(linePreview).not.toHaveValue(/恋愛鑑定|このカードの意味|結論:|現在地:|次の一手:|禁じ手:|一言判定|船長からの一言/);

  const feelingsStaffText = await staffReading.innerText();
  const feelingsLineText = await linePreview.inputValue();
  await page.locator('#tarotSubtopicList [data-subtopic-id="direction"]').click();
  await expect(staffReading).toContainText('【恋愛・関係の行方鑑定】愚者 / 正位置');
  await expect(staffReading).toContainText('現状と理由: 二人の今後では「自由・始まり」が強く出ています。');
  await expect(linePreview).toHaveValue(/^風向き: 安定\n\n二人の航路は分かれ道だ。/);
  expect(await staffReading.innerText()).not.toBe(feelingsStaffText);
  expect(await linePreview.inputValue()).not.toBe(feelingsLineText);

  await page.locator('#tarotTopicList [data-topic-id="relation"]').click();
  await expect(page.locator('#tarotSubtopicList [data-subtopic-id="friends"]')).toHaveClass(/is-active/);
  await page.locator('#tarotDeckTabs [data-deck-id="sword"]').click();
  await page.locator('[data-card-id="sword-7"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(staffReading).toContainText('【人間関係・友人・仲間鑑定】ソード 7 / 逆位置');
  await expect(staffReading).toContainText('現状と理由: 友人・仲間との関係では「嘘の発覚・裏切り」が強く出ています。');
  await expect(staffReading).toContainText('結論: 現在の風向きは');
  await expect(staffReading).toContainText('言葉の行き違いや裏切りを放置すると、関係の線引きが崩れます。');
  await expect(staffReading).toContainText('対策: まず、助け合いが一方通行になっていないかを整えます。隠していた約束違反や事実を一つ整理し');
  await expect(linePreview).toHaveValue(/最悪中の最悪のタイミング/);
  await expect(linePreview).not.toHaveValue(/売上|案件|恋愛|恋人/);

  await page.locator('#tarotTopicList [data-topic-id="future"]').click();
  await page.locator('#tarotSubtopicList [data-subtopic-id="goal"]').click();
  await page.locator('#tarotDeckTabs [data-deck-id="pentacle"]').click();
  await page.locator('[data-card-id="pentacle-8"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(staffReading).toContainText('【将来・目標の実現鑑定】ペンタクル 8 / 正位置');
  await expect(staffReading).toContainText('現状と理由: 目標の実現では「努力・上達」が強く出ています。');
  await expect(staffReading).toContainText('結論: 現在の風向きは');
  await expect(staffReading).toContainText('必要な技能と使えるものを確認し、努力を続けた分だけ成果は積み上がります。');
  await expect(staffReading).toContainText('対策: まず、目標を次の一歩と期限に分けます。伸ばす技能を一つに絞り');
  await expect(linePreview).toHaveValue(/一攫千金のハッタリ/);

  const exhaustive = await page.evaluate(() => {
    const app = window.TarotReadingApp;
    const forbiddenLine = ['このカードの意味', '結論:', '現状と理由:', '近未来:', '対策:', '注意点:', '現在地:', '次の一手:', '禁じ手:', '一言判定', '船長からの一言', '船長の結び', 'スタッフ補助'];
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
      minorStates.get(key).add(entry.parsed['結論']);
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
      grammarBreaks: entries.filter((entry) => /費やしたものした|必要な二人が|転職がはっきり決め|の受け取る余地|続けられるかが(?:安定|弱く)/.test(entry.staff)).length,
      minorStateCollisions: [...minorStates.values()].filter((values) => values.size !== 20).length,
      uniqueCurrentReasons: new Set(sections.map((entry) => entry.parsed['現状と理由'])).size,
      uniqueForecasts: new Set(sections.map((entry) => entry.parsed['近未来'])).size,
      uniqueActions: new Set(sections.map((entry) => entry.parsed['対策'])).size,
      uniqueCautions: new Set(sections.map((entry) => entry.parsed['注意点'])).size,
      hardStaffWords: entries.filter((entry) => /局面|許容範囲|不確実性|実現性|継続性|自己犠牲|リソース|再設計|照合|独善|内省/.test(entry.staff.split(/\r?\n/).slice(1).join('\n'))).length,
      oldHeadings: entries.filter((entry) => /(?:^|\n)(?:このカードが持つ意味は|答え|理由|確認すること|やること|やめること|全体の答え|3枚の流れ):/.test(entry.staff)).length
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
    grammarBreaks: 0,
    minorStateCollisions: 0,
    hardStaffWords: 0,
    oldHeadings: 0
  });
  expect(exhaustive.uniqueCurrentReasons).toBeGreaterThanOrEqual(3000);
  expect(exhaustive.uniqueForecasts).toBe(3120);
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
      relationCupQueen: app.getSpecialReadingBody('relation', card('cup-queen'), 'upright'),
      subtopicWeather: {
        evaluationSword6: app.getReadingWeatherStatus('work', 'evaluation', card('sword-6'), 'upright'),
        careerSword6: app.getReadingWeatherStatus('work', 'career_change', card('sword-6'), 'upright'),
        continueCup8: app.getReadingWeatherStatus('relation', 'continue', card('cup-8'), 'upright')
      },
      threeCardRoleWeather: app.getThreeCardWeatherStatus('love', 'commitment', [
        { card: card('major-14'), orientation: 'upright' },
        { card: card('pentacle-3'), orientation: 'upright' },
        { card: card('cup-2'), orientation: 'upright' }
      ]),
      overriddenBodies: {
        encounterQueen: app.getSubtopicLineBody('love', 'encounter', card('pentacle-queen'), 'reversed', ''),
        familyFool: app.getSubtopicLineBody('relation', 'family', card('major-0'), 'upright', ''),
        evaluationSword6: app.getSubtopicLineBody('work', 'evaluation', card('sword-6'), 'upright', '')
      },
      generatedGuidance: {
        careerPentacle2Line: app.buildLineReading(card('pentacle-2'), 'upright', app.getSpecialReadingBody('work', card('pentacle-2'), 'upright'), app.topics.find((entry) => entry.id === 'work'), 'career_change'),
        encounterCup2Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'love'), card('cup-2'), 'upright', 'encounter'),
        familyWandPageStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'relation'), card('wand-page'), 'upright', 'family'),
        preparationCup2Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'future'), card('cup-2'), 'upright', 'preparation'),
        negotiationPentacle8Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'work'), card('pentacle-8'), 'upright', 'negotiation'),
        feelingsWandKingStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'love'), card('wand-king'), 'upright', 'feelings'),
        encounterWandKingStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'love'), card('wand-king'), 'upright', 'encounter'),
        evaluationCupQueenStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'work'), card('cup-queen'), 'reversed', 'evaluation'),
        negotiationHangedStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'work'), card('major-12'), 'upright', 'negotiation'),
        difficultSword4Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'relation'), card('sword-4'), 'reversed', 'difficult'),
        futureChoiceCup2Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'future'), card('cup-2'), 'upright', 'choice'),
        turningTowerStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'future'), card('major-16'), 'reversed', 'turning_point'),
        workCurrentCup10Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'work'), card('cup-10'), 'reversed', 'current'),
        careerWand7Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'work'), card('wand-7'), 'reversed', 'career_change'),
        negotiationDeathStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'work'), card('major-13'), 'reversed', 'negotiation'),
        futureChoicePentacle8Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'future'), card('pentacle-8'), 'reversed', 'choice'),
        feelingsSword7Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'love'), card('sword-7'), 'reversed', 'feelings'),
        reconciliationPentacle5Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'love'), card('pentacle-5'), 'upright', 'reconciliation'),
        careerPentacle5Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'work'), card('pentacle-5'), 'reversed', 'career_change'),
        familyWandKnightStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'relation'), card('wand-knight'), 'reversed', 'family'),
        difficultSword7Staff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'relation'), card('sword-7'), 'reversed', 'difficult'),
        futureGoalCupQueenStaff: app.buildStaffReading(app.topics.find((entry) => entry.id === 'future'), card('cup-queen'), 'reversed', 'goal'),
        friendsSwordKnightLine: app.buildLineReading(card('sword-knight'), 'reversed', app.getSpecialReadingBody('relation', card('sword-knight'), 'reversed'), app.topics.find((entry) => entry.id === 'relation'), 'friends')
      }
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
  expect(semanticSamples.subtopicWeather).toEqual({
    evaluationSword6: { level: 5, windLabel: '停滞' },
    careerSword6: { level: 9, windLabel: '絶好' },
    continueCup8: { level: 3, windLabel: '逆風' }
  });
  expect(semanticSamples.threeCardRoleWeather).toEqual({
    level: 8,
    windLabel: '良好',
    levels: [7, 6, 9],
    rawLevels: [7, 8, 9]
  });
  expect(semanticSamples.overriddenBodies.encounterQueen).toContain('まだ始まってもいない縁');
  expect(semanticSamples.overriddenBodies.encounterQueen).not.toContain('手に入れた相手');
  expect(semanticSamples.overriddenBodies.familyFool).toContain('身内だからといって');
  expect(semanticSamples.overriddenBodies.familyFool).not.toContain('他人の群れ');
  expect(semanticSamples.overriddenBodies.evaluationSword6).toContain('評価の流れ');
  expect(semanticSamples.overriddenBodies.evaluationSword6).not.toContain('転職や撤退');
  expect(semanticSamples.generatedGuidance.careerPentacle2Line).not.toMatch(/資金繰り|予算|自社のリソース/);
  expect(semanticSamples.generatedGuidance.encounterCup2Staff).toContain('相手が次の約束を返すか確かめてください。');
  expect(semanticSamples.generatedGuidance.familyWandPageStaff).toContain('家族へ新しい提案を一つ伝え、誰がいつ試すかを決めてください。');
  expect(semanticSamples.generatedGuidance.preparationCup2Staff).toContain('自分で補う部分と周囲へ頼む部分を分けてください。');
  expect(semanticSamples.generatedGuidance.negotiationPentacle8Staff).toContain('価格・期限・責任を確認してください。');
  expect(semanticSamples.generatedGuidance.feelingsWandKingStaff).toContain('相手が自分から次の行動を選ぶか見てください。');
  expect(semanticSamples.generatedGuidance.encounterWandKingStaff).toContain('その人と会える場所へ自分から一度参加してください。');
  expect(semanticSamples.generatedGuidance.evaluationCupQueenStaff).toContain('返答する前に事実と要望を分けてください。');
  expect(semanticSamples.generatedGuidance.negotiationHangedStaff).toContain('決裂した場合の代案の三つから条件を見直してください。');
  expect(semanticSamples.generatedGuidance.difficultSword4Staff).toContain('相手の反応を見るまで追加の説明をしないでください。');
  expect(semanticSamples.generatedGuidance.futureChoiceCup2Staff).toContain('やり直せる範囲を同じ基準で比べてください。');
  expect(semanticSamples.generatedGuidance.turningTowerStaff).toContain('助けを求める相手を決めてください。');
  expect(semanticSamples.generatedGuidance.workCurrentCup10Staff).toContain('仕事の優先順位・期限・品質で食い違う点を一つ選び、担当者と決め直してください。');
  expect(semanticSamples.generatedGuidance.careerWand7Staff).toContain('収入・健康・働き方のうち最優先で守る条件を一つ決め、合わない求人を外してください。');
  expect(semanticSamples.generatedGuidance.negotiationDeathStaff).toContain('成立しない条件を一つ外し、保留中の合意をまとめるか交渉を終えるか決めてください。');
  expect(semanticSamples.generatedGuidance.futureChoicePentacle8Staff).toContain('選択肢に残る未確認の条件を一つ調べ、根拠が曖昧だった比較をやり直してください。');
  expect(semanticSamples.generatedGuidance.feelingsSword7Staff).toContain('相手の言葉と実際の行動が食い違う点を一つ確認し');
  expect(semanticSamples.generatedGuidance.reconciliationPentacle5Staff).toContain('共通の知人か相談先を一人選び、別れの原因を整理してください。');
  expect(semanticSamples.generatedGuidance.careerPentacle5Staff).toContain('転職相談・紹介・公的支援から一つ使い');
  expect(semanticSamples.generatedGuidance.familyWandKnightStaff).toContain('落ち着いてから役割と負担を一つずつ決めてください。');
  expect(semanticSamples.generatedGuidance.difficultSword7Staff).toContain('相手の発言と実際の行動が食い違う点を記録し');
  expect(semanticSamples.generatedGuidance.futureGoalCupQueenStaff).toContain('目標に使う時間・お金・他人の助けのうち');
  expect(semanticSamples.generatedGuidance.friendsSwordKnightLine).not.toMatch(/相手の感情|ドン引き/);

  await page.locator('#tarotTopicList [data-topic-id="work"]').click();
  await page.locator('#tarotSubtopicList [data-subtopic-id="business"]').click();
  await page.locator('#tarotDeckTabs [data-deck-id="major"]').click();
  await page.locator('[data-card-id="major-16"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(staffReading).toContainText('【仕事・独立・事業鑑定】塔 / 逆位置');
  await expect(staffReading).toContainText('現状と理由: 独立・事業では「問題が残る・警告」が強く出ています。');
  await expect(staffReading).toContainText('対策: まず、需要・利益・続けられる体制を小さく試します。まだ残る火種を一つ特定し');
  await expect(linePreview).toHaveValue(/^風向き: 荒天\n\n今のまま旗を上げれば船ごと沈む。/);
  await expect(linePreview).toHaveValue(/致命傷は免れたようだが/);

  await page.locator('#tarotSendLine').click();
  await expect.poll(() => sendRequests.length).toBe(1);
  expect(sendRequests[0]).toMatchObject({
    customerRef: 'TROY:CUSTOMER123',
    topicId: 'work',
    topicLabel: '仕事',
    subtopicId: 'business',
    subtopicLabel: '独立・事業',
    cardId: 'major-16',
    cardLabel: '塔',
    orientation: 'reversed',
    orientationLabel: '逆位置'
  });
  expect(sendRequests[0]).not.toHaveProperty('staffPin');
  expect(sendRequests[0]).not.toHaveProperty('staffName');
  expect(sendRequests[0]).not.toHaveProperty('note');
  expect(sendRequests[0].resultText).toMatch(/^風向き: 荒天\n\n今のまま旗を上げれば船ごと沈む。/);
  expect(sendRequests[0].resultText).toContain('致命傷は免れたようだが');
  expect(sendRequests[0].resultText).toContain('大炎上の余波');
  expect(sendRequests[0].resultText).not.toMatch(/仕事鑑定|このカードの意味|結論:|船長からの一言|船長の結び/);
  await expect(page.locator('#tarotReadingStatus')).toContainText('送信済み');
});

test('tarot layout keeps the controls compact and the reading legible on desktop and mobile', async ({ page }) => {
  await mockStoreCustomers(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tarot-reading.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.TarotReadingApp?.buildStaffReading);
  await page.locator('[data-card-id="major-0"]').click();

  const desktop = await page.evaluate(() => {
    const root = document.documentElement;
    const customer = document.querySelector('.tarot-reading-customer').getBoundingClientRect();
    const topic = document.querySelector('.tarot-reading-topic').getBoundingClientRect();
    const staff = document.querySelector('#tarotStaffReadingText').getBoundingClientRect();
    return {
      viewportWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      controlsGap: topic.top - customer.bottom,
      staffWidth: staff.width
    };
  });
  expect(desktop.scrollWidth).toBeLessThanOrEqual(desktop.viewportWidth);
  expect(desktop.controlsGap).toBeGreaterThanOrEqual(0);
  expect(desktop.controlsGap).toBeLessThanOrEqual(20);
  expect(desktop.staffWidth).toBeGreaterThanOrEqual(380);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const root = document.documentElement;
    const staff = document.querySelector('#tarotStaffReadingText').getBoundingClientRect();
    return {
      viewportWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      staffWidth: staff.width
    };
  });
  expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.viewportWidth);
  expect(mobile.staffWidth).toBeGreaterThanOrEqual(330);
});

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
  await expect(staffReading).toContainText('総合結論:');
  await expect(staffReading).toContainText('1枚目・表に出ている気持ち: 愚者 / 正位置');
  await expect(staffReading).toContainText('2枚目・隠している本音: 塔 / 逆位置');
  await expect(staffReading).toContainText('3枚目・次に見せる行動: 審判 / 正位置');
  await expect(staffReading).toContainText('3枚のつながり:');
  await expect(staffReading).toContainText('すすめる行動:');
  await expect(staffReading).toContainText('注意点:');
  await expect(staffReading).not.toContainText('お前さん');

  const linePreview = page.locator('#tarotResultText');
  await expect(linePreview).toHaveValue(/^風向き: [^\n]+\n\n/);
  await expect(linePreview).toHaveValue(/1枚目「表に出ている気持ち」/);
  await expect(linePreview).toHaveValue(/2枚目「隠している本音」/);
  await expect(linePreview).toHaveValue(/3枚目「次に見せる行動」/);
  await expect(linePreview).not.toHaveValue(/総合結論:|3枚のつながり:|すすめる行動:|注意点:/);

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
  await expect(staffReading).toContainText('このカードが持つ意味は、相手の気持ちに表れる「自由・始まり」です。');
  await expect(staffReading).toContainText('今の状態: 相手の気持ちはまだ固まっていません。');
  await expect(staffReading).toContainText('鑑定の要点: 相手の気持ちを読むと、二人を動かす根本の感情と、相手が選ぼうとしている方向を見ます。');
  await expect(staffReading).toContainText('すすめる行動: 本音を確かめるには、次に自分から取る行動を決め');
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
  await expect(staffReading).toContainText('このカードが持つ意味は、二人の関係の行方を左右する「自由・始まり」です。');
  await expect(linePreview).toHaveValue(/^風向き: 安定\n\n二人の航路は分かれ道だ。/);
  expect(await staffReading.innerText()).not.toBe(feelingsStaffText);
  expect(await linePreview.inputValue()).not.toBe(feelingsLineText);

  await page.locator('#tarotTopicList [data-topic-id="relation"]').click();
  await expect(page.locator('#tarotSubtopicList [data-subtopic-id="friends"]')).toHaveClass(/is-active/);
  await page.locator('#tarotDeckTabs [data-deck-id="sword"]').click();
  await page.locator('[data-card-id="sword-7"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(staffReading).toContainText('【人間関係・友人・仲間鑑定】ソード 7 / 逆位置');
  await expect(staffReading).toContainText('このカードが持つ意味は、友人や仲間との信頼に表れる「露見・不誠実」です。');
  await expect(staffReading).toContainText('今の状態: 友人や仲間との信頼は大きく損なわれています。');
  await expect(staffReading).toContainText('鑑定の要点: 友人や仲間との関係では、言葉の行き違い、裏切り、境界線を見ます。');
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
  await expect(staffReading).toContainText('今の状態: 目標を実現できる余地があります。');
  await expect(staffReading).toContainText('鑑定の要点: 目標の実現については、必要な技能、資源、継続量、成果の積み上げを見ます。');
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
      relationCupQueen: app.getSpecialReadingBody('relation', card('cup-queen'), 'upright'),
      subtopicWeather: {
        evaluationSword6: app.getReadingWeatherStatus('work', 'evaluation', card('sword-6'), 'upright'),
        careerSword6: app.getReadingWeatherStatus('work', 'career_change', card('sword-6'), 'upright'),
        continueCup8: app.getReadingWeatherStatus('relation', 'continue', card('cup-8'), 'upright')
      },
      overriddenBodies: {
        encounterQueen: app.getSubtopicLineBody('love', 'encounter', card('pentacle-queen'), 'reversed', ''),
        familyFool: app.getSubtopicLineBody('relation', 'family', card('major-0'), 'upright', ''),
        evaluationSword6: app.getSubtopicLineBody('work', 'evaluation', card('sword-6'), 'upright', '')
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
  expect(semanticSamples.overriddenBodies.encounterQueen).toContain('まだ始まってもいない縁');
  expect(semanticSamples.overriddenBodies.encounterQueen).not.toContain('手に入れた相手');
  expect(semanticSamples.overriddenBodies.familyFool).toContain('身内だからといって');
  expect(semanticSamples.overriddenBodies.familyFool).not.toContain('他人の群れ');
  expect(semanticSamples.overriddenBodies.evaluationSword6).toContain('評価の流れ');
  expect(semanticSamples.overriddenBodies.evaluationSword6).not.toContain('転職や撤退');

  await page.locator('#tarotTopicList [data-topic-id="work"]').click();
  await page.locator('#tarotSubtopicList [data-subtopic-id="business"]').click();
  await page.locator('#tarotDeckTabs [data-deck-id="major"]').click();
  await page.locator('[data-card-id="major-16"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(staffReading).toContainText('【仕事・独立・事業鑑定】塔 / 逆位置');
  await expect(staffReading).toContainText('このカードが持つ意味は、独立や事業の勝算を示す「余波・警告」です。');
  await expect(staffReading).toContainText('すすめる行動: 勝算を形にするには、まだ残る火種を一つ特定し');
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

const { test, expect } = require('@playwright/test');

test('staff tarot page scans customer QR, generates a major arcana reading, and sends it to LINE', async ({ page }) => {
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
    const body = route.request().postDataJSON();
    sendRequests.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, sent: true, readingId: 'tarot-test', lineUserIdMasked: 'U1234...abcd' })
    });
  });

  await page.goto('/tarot-reading.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.TarotReadingApp?.getWeatherStatus);
  const weatherSamples = await page.evaluate(() => {
    const app = window.TarotReadingApp;
    const tower = app.allCards.find((card) => card.id === 'major-16');
    const sun = app.allCards.find((card) => card.id === 'major-19');
    return {
      tower: app.getWeatherStatus(tower, 'upright'),
      sun: app.getWeatherStatus(sun, 'upright')
    };
  });
  expect(weatherSamples.tower).toMatchObject({ level: 1, title: '巨大嵐・沈没寸前' });
  expect(weatherSamples.sun).toMatchObject({ level: 10, title: '快晴・完璧な追い風' });

  await expect(page.locator('h1')).toHaveText('タロット航路');
  await page.locator('#tarotStaffName').fill('ミナト');
  await page.locator('#tarotStaffPin').fill('2468');

  await page.locator('#tarotScanCustomer').click();
  await expect(page.locator('#tarotCustomerRef')).toHaveValue('TROY:CUSTOMER123');

  await page.locator('[data-card-id="major-0"]').click();
  await expect(page.locator('#tarotWeatherStatus')).toBeVisible();
  await expect(page.locator('#tarotWeatherLevel')).toHaveText('Lv.6');
  await expect(page.locator('#tarotWeatherTitle')).toHaveText('凪・風速ゼロ');
  await expect(page.locator('#tarotResultText')).toHaveValue(/【総合】愚者 \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/今日の航海コンディション: Lv\.6 凪・風速ゼロ/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/厳しい見立て/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/このカードの意味/);

  await page.locator('#tarotTopicList [data-topic-id="love"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【恋愛】愚者 \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/愛が味方してくれるとでも/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/結論:/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/このカードの意味: 恋愛では恋の大きな流れに「自由はあります」が出ているサイン。/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/船長からの一言:/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/次に取るべき一手:/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/やってはいけないこと:/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('[data-card-id="major-21"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【恋愛】世界 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/信頼の船底にヒビ/);

  await page.locator('#tarotDeckTabs [data-deck-id="wand"]').click();
  await page.locator('[data-card-id="wand-1"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【恋愛】ワンド A \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/新しい恋の火種/);

  await page.locator('#tarotDeckTabs [data-deck-id="cup"]').click();
  await page.locator('[data-card-id="cup-1"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【恋愛】カップ A \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/新しい恋への期待/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/人間関係への期待/);
  await expect(page.locator('#tarotStaffGuide')).toBeVisible();
  await expect(page.locator('#tarotStaffOpening')).toContainText('押すより整える恋');
  await expect(page.locator('#tarotStaffQuestion')).toContainText('相手に一番聞きたいこと');

  await page.locator('[data-card-id="cup-7"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【恋愛】カップ 7 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/恋愛計画が、ただのペテン/);

  await page.locator('[data-card-id="cup-king"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【恋愛】カップ キング \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/器の小さい男の醜態/);

  await page.locator('#tarotDeckTabs [data-deck-id="sword"]').click();
  await page.locator('[data-card-id="sword-1"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【恋愛】ソード A \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/刃が抜かれたな/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('#tarotDeckTabs [data-deck-id="pentacle"]').click();
  await page.locator('[data-card-id="pentacle-king"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【恋愛】ペンタクル キング \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/愛情を金で買おうとしたり/);

  await page.locator('#tarotTopicList [data-topic-id="relation"]').click();
  await page.locator('#tarotDeckTabs [data-deck-id="major"]').click();
  await page.locator('[data-card-id="major-13"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【人間関係】死神 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/往生際が悪い/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/やってはいけないこと:/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('#tarotDeckTabs [data-deck-id="wand"]').click();
  await page.locator('[data-card-id="wand-10"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【人間関係】ワンド 10 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/一掴みの味方/);

  await page.locator('#tarotDeckTabs [data-deck-id="cup"]').click();
  await page.locator('[data-card-id="cup-10"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【人間関係】カップ 10 \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/無敵の連帯感/);

  await page.locator('#tarotDeckTabs [data-deck-id="sword"]').click();
  await page.locator('[data-card-id="sword-7"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【人間関係】ソード 7 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/最悪中の最悪のタイミング/);

  await page.locator('#tarotDeckTabs [data-deck-id="pentacle"]').click();
  await page.locator('[data-card-id="pentacle-king"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【人間関係】ペンタクル キング \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/人脈を金で買おうとしたり/);

  await page.locator('#tarotTopicList [data-topic-id="future"]').click();
  await page.locator('#tarotDeckTabs [data-deck-id="major"]').click();
  await page.locator('[data-card-id="major-13"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【将来】死神 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/往生際が悪い/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/船長からの一言:/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('#tarotDeckTabs [data-deck-id="wand"]').click();
  await page.locator('[data-card-id="wand-7"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【将来】ワンド 7 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/すべてが中途半端/);

  await page.locator('#tarotDeckTabs [data-deck-id="cup"]').click();
  await page.locator('[data-card-id="cup-10"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【将来】カップ 10 \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/無敵の安定感/);

  await page.locator('#tarotDeckTabs [data-deck-id="sword"]').click();
  await page.locator('[data-card-id="sword-10"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【将来】ソード 10 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/気づいたか/);

  await page.locator('#tarotDeckTabs [data-deck-id="pentacle"]').click();
  await page.locator('[data-card-id="pentacle-8"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【将来】ペンタクル 8 \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/一攫千金のハッタリ/);

  await page.locator('#tarotTopicList [data-topic-id="work"]').click();
  await page.locator('#tarotDeckTabs [data-deck-id="wand"]').click();
  await page.locator('[data-card-id="wand-10"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【仕事】ワンド 10 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/強制的な損切り/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/今起きていること:/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('#tarotDeckTabs [data-deck-id="cup"]').click();
  await page.locator('[data-card-id="cup-7"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【仕事】カップ 7 \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/幻影の新規事業/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('#tarotDeckTabs [data-deck-id="sword"]').click();
  await page.locator('[data-card-id="sword-king"]').click();
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【仕事】ソード キング \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/パワハラ上司/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('#tarotDeckTabs [data-deck-id="pentacle"]').click();
  await page.locator('[data-card-id="pentacle-8"]').click();
  await page.locator('[data-orientation="upright"]').click();
  await expect(page.locator('#tarotResultText')).toHaveValue(/【仕事】ペンタクル 8 \/ 正位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/徹底的な実務の反復と継続/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('#tarotDeckTabs [data-deck-id="major"]').click();
  await page.locator('[data-card-id="major-16"]').click();
  await expect(page.locator('#tarotWeatherLevel')).toHaveText('Lv.1');
  await expect(page.locator('#tarotWeatherTitle')).toHaveText('巨大嵐・沈没寸前');
  await expect(page.locator('#tarotResultText')).toHaveValue(/今日の航海コンディション: Lv\.1 巨大嵐・沈没寸前/);
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('#tarotWeatherLevel')).toHaveText('Lv.2');
  await expect(page.locator('#tarotWeatherTitle')).toHaveText('大時化・逆巻く怒濤');

  await expect(page.locator('#tarotReadingApp')).toHaveClass(/is-major-selected/);
  await expect(page.locator('#tarotMajorBadge')).toBeVisible();
  await expect(page.locator('#tarotSelectedName')).toHaveText('塔');
  await expect(page.locator('#tarotResultText')).toHaveValue(/【仕事】塔 \/ 逆位置/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/今日の航海コンディション: Lv\.2 大時化・逆巻く怒濤/);
  await expect(page.locator('#tarotResultText')).toHaveValue(/大炎上の余波/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/大アルカナが出たので/);
  await expect(page.locator('#tarotResultText')).not.toHaveValue(/厳しい見立て/);

  await page.locator('#tarotReadingNote').fill('次回来店時に確認');
  await page.locator('#tarotSendLine').click();

  await expect.poll(() => sendRequests.length).toBe(1);
  expect(sendRequests[0]).toMatchObject({
    customerRef: 'TROY:CUSTOMER123',
    staffPin: '2468',
    staffName: 'ミナト',
    topicId: 'work',
    topicLabel: '仕事',
    cardId: 'major-16',
    cardLabel: '塔',
    orientation: 'reversed',
    orientationLabel: '逆位置',
    note: '次回来店時に確認'
  });
  expect(sendRequests[0].resultText).toContain('【仕事】塔 / 逆位置');
  expect(sendRequests[0].resultText).toContain('今日の航海コンディション: Lv.2 大時化・逆巻く怒濤');
  expect(sendRequests[0].resultText).toContain('大炎上の余波');
  expect(sendRequests[0].resultText).toContain('このカードの意味: 仕事では仕事運全体の潮目');
  expect(sendRequests[0].resultText).toContain('船長からの一言');
  expect(sendRequests[0].resultText).not.toContain('厳しい見立て');
  expect(sendRequests[0].resultText).not.toContain('スタッフ補助');
  expect(sendRequests[0].resultText).not.toContain('最初にこう伝える');
  await expect(page.locator('#tarotReadingStatus')).toContainText('送信済み');
});

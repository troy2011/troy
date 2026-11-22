// Tavern games, set B: turn-based board and dice games, and two party games where the phone only keeps time.
// Boards are drawn in both halves so the waiting player can follow; only the player whose turn it is can tap.
(() => {
  'use strict';
  const games = window.tavernNewGames ??= [];
  const seatName = s => s + 1 + 'P';
  const both = fn => { fn(0); fn(1); };
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const win = (ctx, s, why) => ctx.finish(s, seatName(s) + 'の勝ち！ ' + (why || ''));
  const meta = (id, name, category, icon, description, create) => games.push({ id, name, category, icon, description, create });

  // One grid of cells in each half. `cells[i]` = { label, mark (0 / 1 / null), disabled, a11y }.
  function board(ctx, cells, cols, activeSeat, activate) {
    both(seat => {
      const grid = make('div', null, 'xgame-grid xgame-board');
      grid.style.setProperty('--cols', cols);
      cells.forEach((cell, i) => {
        const button = make('button', cell.label, 'xgame-action');
        button.type = 'button';
        button.disabled = seat !== activeSeat || !!cell.disabled;
        if (cell.mark === 0 || cell.mark === 1) button.dataset.mark = cell.mark === seat ? 'mine' : 'theirs';
        if (cell.tone) button.dataset.tone = cell.tone;
        if (cell.a11y) button.setAttribute('aria-label', cell.a11y);
        button.addEventListener('click', () => { if (!button.disabled) activate(i); });
        grid.append(button);
      });
      ctx.zones[seat].append(grid);
    });
  }
  const moveFocus = (ctx, s, i) => ctx.zones[s].querySelectorAll('.xgame-board button')[i]?.focus({ preventScroll: true });
  const turnLine = (ctx, turn, mineText) => both(s => ctx.text(s, s === turn ? mineText : '相手の番', 'xgame-text'));

  meta('cargo-stow', '船荷ならべ', 'strategy', '📦', '縦か横に隣り合う空きマス2つに船荷を置く。置けなくなった方の負け。', ctx => {
    let turn = ctx.starter;
    let first = -1;
    const size = 4;
    const cargo = Array(size * size).fill(null);
    const adjacent = (a, b) => Math.abs((a % size) - (b % size)) + Math.abs(Math.floor(a / size) - Math.floor(b / size)) === 1;
    const fits = i => cargo[i] === null && cargo.some((value, j) => value === null && adjacent(i, j));
    const render = () => {
      ctx.clear();
      ctx.turn(turn);
      ctx.say(seatName(turn) + 'の番　船荷を縦か横の2マスに');
      turnLine(ctx, turn, first < 0 ? '船荷の片側を選ぶ' : '隣のマスを選んで置く');
      board(ctx, cargo.map((v, i) => ({
        label: v !== null ? '📦' : i === first ? '◆' : '・',
        mark: v,
        disabled: v !== null || (first < 0 ? !fits(i) : i !== first && !adjacent(first, i)),
        a11y: '行 ' + (1 + Math.floor(i / size)) + ' 列 ' + (1 + (i % size)) + (v === null ? ' 空き' : ' ' + seatName(v) + ' の船荷'),
      })), size, turn, select);
    };
    function select(i) {
      if (!fits(i)) return;
      if (first < 0) { first = i; render(); moveFocus(ctx, turn, i); return; }
      if (i === first) { first = -1; render(); moveFocus(ctx, turn, i); return; }
      if (!adjacent(first, i)) return;
      cargo[first] = cargo[i] = turn;
      first = -1;
      ctx.fx.tap();
      if (!cargo.some((_, j) => fits(j))) { win(ctx, turn, '相手はもう船荷を置けない。'); return; }
      turn = 1 - turn;
      render();
    }
    return { start: render };
  });

  meta('take-fifteen', '15の取り合い', 'strategy', '🧮', '1〜9を交互に1枚ずつ取る。自分の数字のどれか3枚で15を作れば勝ち。', ctx => {
    let turn = ctx.starter;
    const picked = [[], []];
    const nums = Array.from({ length: 9 }, (_, i) => i + 1);
    const threeSum = a => a.some((x, i) => a.slice(i + 1).some((y, j) => a.slice(i + j + 2).includes(15 - x - y)));
    const render = () => {
      ctx.clear();
      ctx.turn(turn);
      ctx.say(seatName(turn) + 'の番　自分の数字3枚で15を作る');
      both(s => ctx.text(s, 'あなた：' + (picked[s].join('・') || 'なし') + '　相手：' + (picked[1 - s].join('・') || 'なし'), 'xgame-text'));
      board(ctx, nums.map(n => ({
        label: String(n),
        disabled: picked.some(a => a.includes(n)),
        mark: picked[0].includes(n) ? 0 : picked[1].includes(n) ? 1 : null,
      })), 3, turn, pick);
    };
    function pick(i) {
      const n = nums[i];
      if (picked.some(a => a.includes(n))) return;
      picked[turn].push(n);
      ctx.fx.tap();
      if (threeSum(picked[turn])) { win(ctx, turn, '3枚で15を完成。'); return; }
      if (picked[0].length + picked[1].length === 9) { ctx.finish(null, '9枚を取り切って引き分け。'); return; }
      turn = 1 - turn;
      render();
    }
    return { start: render };
  });

  meta('claim-route', '航路の取り合い', 'strategy', '🧭', '1Pは上から下、2Pは左から右。自分の港をつないで先に航路を作る。', ctx => {
    let turn = ctx.starter;
    const w = 4;
    const ports = Array(w * w).fill(null);
    const offsets = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, 1]];
    const route = s => {
      const queue = ports.map((p, i) => (p === s && (s === 0 ? i < w : i % w === 0) ? i : -1)).filter(i => i >= 0);
      const seen = new Set(queue);
      for (let k = 0; k < queue.length; k++) {
        const i = queue[k], r = Math.floor(i / w), c = i % w;
        if (s === 0 ? r === w - 1 : c === w - 1) return true;
        for (const [dr, dc] of offsets) {
          const nr = r + dr, nc = c + dc, j = nr * w + nc;
          if (nr >= 0 && nr < w && nc >= 0 && nc < w && !seen.has(j) && ports[j] === s) { queue.push(j); seen.add(j); }
        }
      }
      return false;
    };
    const render = () => {
      ctx.clear();
      ctx.turn(turn);
      ctx.say(seatName(turn) + 'の番　上下左右と、右上・左下につながる');
      both(s => ctx.text(s, s === turn ? (s === 0 ? 'あなたは上→下をつなぐ' : 'あなたは左→右をつなぐ') : '相手の番　' + (s === 0 ? 'あなたは上→下' : 'あなたは左→右'), 'xgame-text'));
      board(ctx, ports.map((p, i) => ({
        label: p === null ? '・' : '⚓',
        mark: p,
        disabled: p !== null,
        a11y: '行 ' + (1 + Math.floor(i / w)) + ' 列 ' + (1 + (i % w)) + (p === null ? ' 空き' : ' ' + seatName(p) + ' の港'),
      })), w, turn, pick);
    };
    function pick(i) {
      if (ports[i] !== null) return;
      ports[i] = turn;
      ctx.fx.tap();
      if (route(turn)) { win(ctx, turn, '対岸までの航路が開通。'); return; }
      if (ports.every(p => p !== null)) { ctx.finish(null, 'すべての港が埋まって引き分け。'); return; }
      turn = 1 - turn;
      render();
    }
    return { start: render };
  });

  // ---- 海賊ダイス: push your luck. Roll to build up gold; a skull loses this turn's gold. ----
  const DICE_GOAL = 30;
  const DICE_FACES = ['☠', '⚀', '⚁', '⚂', '⚃', '⚄'];
  const DICE_ROLL_MS = 420;
  meta('pirate-dice', '海賊ダイス', 'luck', '🎲', '振るたびに金貨が貯まる。ドクロが出たらその番の分は没収。先に30枚で勝ち。', ctx => {
    let turn = ctx.starter;
    const bank = [0, 0];
    let pot = 0;
    let face = null;
    let rolling = false;
    const render = note => {
      ctx.clear();
      ctx.turn(turn);
      ctx.say(note || seatName(turn) + 'の番　この番の金貨 ' + pot);
      both(s => {
        ctx.text(s, 'あなた ' + bank[s] + ' 枚　相手 ' + bank[1 - s] + ' 枚　（' + DICE_GOAL + ' 枚で勝ち）', 'xgame-text');
        ctx.text(s, rolling ? '🎲' : face == null ? '🎲' : DICE_FACES[face - 1], 'xgame-big' + (rolling ? ' is-rolling' : face === 1 ? ' is-bust' : ''));
        ctx.text(s, s === turn ? 'この番の金貨　' + pot + ' 枚' : '相手のこの番　' + pot + ' 枚', 'xgame-text');
      });
      ctx.button(turn, '振る', roll, rolling);
      ctx.button(turn, '貯めて交代', keep, rolling || pot === 0);
    };
    function roll() {
      if (rolling) return;
      rolling = true;
      ctx.fx.tap();
      render();
      ctx.later(() => {
        rolling = false;
        face = 1 + ctx.random(6);
        if (face === 1) {
          ctx.fx.wrong();
          const lost = pot;
          pot = 0;
          turn = 1 - turn;
          render('☠ ドクロ！ ' + lost + ' 枚没収　' + seatName(turn) + 'の番');
          return;
        }
        pot += face;
        ctx.fx.correct();
        if (bank[turn] + pot >= DICE_GOAL) { bank[turn] += pot; win(ctx, turn, bank[turn] + ' 枚に到達。'); return; }
        render();
      }, DICE_ROLL_MS);
    }
    function keep() {
      if (rolling || pot === 0) return;
      bank[turn] += pot;
      ctx.fx.coinRest();
      const kept = pot;
      pot = 0;
      face = null;
      turn = 1 - turn;
      render(seatName(1 - turn) + ' が ' + kept + ' 枚を貯めた　' + seatName(turn) + 'の番');
    }
    return { start: () => render() };
  });

  // ---- 樽の剣刺し: one hole in the barrel springs the trap. Take turns stabbing. ----
  const BARREL_HOLES = 12;
  meta('barrel-swords', '樽の剣刺し', 'luck', '🗡', '交互に樽の穴へ剣を刺す。ひとつだけ当たりの穴があり、刺した方の負け。', ctx => {
    let turn = ctx.starter;
    const trap = ctx.random(BARREL_HOLES);
    const stabbed = Array(BARREL_HOLES).fill(null);
    const render = () => {
      ctx.clear();
      ctx.turn(turn);
      const left = stabbed.filter(v => v === null).length;
      ctx.say(seatName(turn) + 'の番　残りの穴 ' + left);
      turnLine(ctx, turn, '穴を選んで剣を刺す（残り ' + left + '）');
      board(ctx, stabbed.map((v, i) => ({
        label: v === null ? '◯' : '🗡',
        mark: v,
        disabled: v !== null,
        a11y: (i + 1) + '番の穴' + (v === null ? '' : '（刺さっている）'),
      })), 4, turn, stab);
    };
    function stab(i) {
      if (stabbed[i] !== null) return;
      stabbed[i] = turn;
      if (i === trap) {
        ctx.fx.wrong();
        ctx.finish(1 - turn, '💥 樽から海賊が飛び出した！ ' + seatName(turn) + ' の負け');
        return;
      }
      ctx.fx.tap();
      turn = 1 - turn;
      render();
    }
    return { start: render };
  });

  // ---- 宝島の発掘: dig the island. Numbers tell how many treasures are next to a spot; skulls cost a treasure. ----
  const DIG_SIZE = 4;
  const DIG_TREASURES = 4;
  const DIG_SKULLS = 2;
  meta('treasure-dig', '宝島の発掘', 'strategy', '⛏', '交互に掘る。数字はまわりのお宝の数。お宝なら続けて掘れる。ドクロは1つ没収。', ctx => {
    let turn = ctx.starter;
    const cells = DIG_SIZE * DIG_SIZE;
    const order = Array.from({ length: cells }, (_, i) => i);
    for (let i = cells - 1; i > 0; i--) { const j = ctx.random(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const treasure = new Set(order.slice(0, DIG_TREASURES));
    const skull = new Set(order.slice(DIG_TREASURES, DIG_TREASURES + DIG_SKULLS));
    const dug = Array(cells).fill(null);
    const found = [0, 0];
    const near = i => {
      const r = Math.floor(i / DIG_SIZE), c = i % DIG_SIZE;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if ((dr || dc) && nr >= 0 && nr < DIG_SIZE && nc >= 0 && nc < DIG_SIZE && treasure.has(nr * DIG_SIZE + nc)) n++;
      }
      return n;
    };
    const label = i => (dug[i] === null ? '' : treasure.has(i) ? '💰' : skull.has(i) ? '☠' : String(near(i)));
    const render = note => {
      ctx.clear();
      ctx.turn(turn);
      ctx.say(note || seatName(turn) + 'の番　お宝 1P ' + found[0] + '　2P ' + found[1]);
      both(s => ctx.text(s, 'あなた 💰' + found[s] + '　相手 💰' + found[1 - s] + '　残り ' + (DIG_TREASURES - [...treasure].filter(i => dug[i] !== null).length), 'xgame-text'));
      board(ctx, dug.map((v, i) => ({
        label: label(i) || '▒',
        mark: v,
        tone: dug[i] === null ? '' : treasure.has(i) ? 'gold' : skull.has(i) ? 'skull' : 'sand',
        disabled: v !== null,
        a11y: '行 ' + (1 + Math.floor(i / DIG_SIZE)) + ' 列 ' + (1 + (i % DIG_SIZE)) + (v === null ? ' 未発掘' : ' ' + label(i)),
      })), DIG_SIZE, turn, dig);
    };
    function dig(i) {
      if (dug[i] !== null) return;
      dug[i] = turn;
      if (treasure.has(i)) {
        found[turn]++;
        ctx.fx.correct();
        if ([...treasure].every(t => dug[t] !== null)) {
          ctx.finish(found[0] === found[1] ? null : found[0] > found[1] ? 0 : 1, 'お宝 ' + found[0] + ' 対 ' + found[1]);
          return;
        }
        render(seatName(turn) + ' がお宝を発見！ もう一度掘れる');
        return;
      }
      if (skull.has(i)) {
        found[turn] = Math.max(0, found[turn] - 1);
        ctx.fx.wrong();
        turn = 1 - turn;
        render('☠ ドクロ！ お宝を1つ没収　' + seatName(turn) + 'の番');
        return;
      }
      ctx.fx.tap();
      turn = 1 - turn;
      render();
    }
    return { start: () => render() };
  });

  // ---- Party games: the phone keeps time and judges; the fun is out loud. ----
  meta('captain-topic', '船長のお題バトル（古今東西）', 'party', '💬', 'お題に合う言葉を交互に言う。7秒以内。重複かお題外なら負け。', ctx => {
    const topics = ['海にいる生き物', '赤いもの', '果物の名前', '楽器の名前', 'コンビニにあるもの', '「か」で始まる食べ物', '船にありそうなもの', '空を飛ぶもの', '丸いもの', '動物の鳴き声'];
    const TOPIC_ANSWER_MS = 7000;
    let turn = ctx.starter, nonce = 0, count = 0, active = false, topic = '';
    function prep() {
      ctx.clear();
      ctx.turn(turn);
      ctx.say('お題：' + topic + '　答えは口で言い、相手が判定');
      both(s => ctx.text(s, 'お題：' + topic, 'xgame-big is-topic'));
      ctx.button(turn, count === 0 ? '最初の人、準備OK' : '準備OK', prompt);
    }
    function prompt() {
      if (active) return;
      const tag = ++nonce;
      active = true;
      ctx.clear();
      ctx.turn(turn);
      ctx.say('お題：' + topic + '　' + (count + 1) + '答目');
      both(s => ctx.text(s, 'お題：' + topic, 'xgame-big is-topic'));
      ctx.text(turn, '7秒以内に言ってから押す', 'xgame-text');
      const bar = make('div', null, 'xgame-timer');
      ctx.zones[turn].append(bar);
      ctx.button(turn, '言えた', () => { if (tag === nonce) { nonce++; active = false; judge(); } });
      ctx.later(() => { if (active && tag === nonce) { active = false; nonce++; ctx.fx.wrong(); win(ctx, 1 - turn, '時間切れ。'); } }, TOPIC_ANSWER_MS);
    }
    function judge() {
      ctx.clear();
      ctx.turn(1 - turn);
      ctx.say('お題：' + topic + '　判定は相手');
      ctx.text(1 - turn, '相手の答えは、お題に合っていて初めて出た言葉？', 'xgame-text');
      ctx.text(turn, '相手が判定中…', 'xgame-text');
      ctx.button(1 - turn, 'OK', () => { count++; ctx.fx.correct(); if (count === 30) { ctx.finish(null, '30答クリア！ 引き分け。'); return; } turn = 1 - turn; prep(); });
      ctx.button(1 - turn, '重複・お題外', () => { ctx.fx.wrong(); win(ctx, 1 - turn, '答えが重複、またはお題の外でした。'); });
    }
    return { start() { topic = topics[ctx.random(topics.length)]; prep(); } };
  });

  meta('captain-charades', '船長の無言芝居', 'party', '🎭', '声を出さずに演技して、相手にお題を当ててもらう協力ゲーム。4問中3問でクリア。', ctx => {
    const prompts = ['大きな魚を釣る', '海賊の望遠鏡', 'おばけに驚く', 'スープを味見する', '猫が伸びをする', '船の舵を回す', '急いで歯を磨く', '傘が風で飛ぶ', '鍵を探す', '弓を引く', '犬の散歩', '宝箱が重くて持てない'];
    const CHARADE_MS = 25000;
    let turn = ctx.starter, attempts = 0, solved = 0, nonce = 0;
    const used = new Set();
    function next() {
      ctx.clear();
      ctx.turn(turn);
      ctx.say('4問中3問でふたりの勝ち　1問25秒');
      if (attempts === 4) { ctx.finish(null, (solved >= 3 ? 'ふたりでクリア！' : '今回は失敗。') + ' ' + solved + '／4問正解。'); return; }
      ctx.text(1 - turn, '画面から目をそらしてね', 'xgame-text');
      ctx.button(turn, seatName(turn) + 'だけお題を見る', secretPrompt);
    }
    function secretPrompt() {
      const available = prompts.filter(p => !used.has(p)), word = available[ctx.random(available.length)];
      used.add(word);
      ctx.clear();
      ctx.say('演じる人だけ見てください');
      ctx.text(turn, word, 'xgame-big is-topic');
      ctx.text(1 - turn, 'まだ見ないで！', 'xgame-text');
      ctx.button(turn, '覚えた。お題を隠して開始', play);
    }
    function play() {
      const tag = ++nonce;
      ctx.clear();
      ctx.say('声を出さずに演技　相手は口で答える');
      ctx.text(turn, '第' + (attempts + 1) + '問：あなたが演技', 'xgame-text');
      ctx.text(1 - turn, '第' + (attempts + 1) + '問：答えを口で言おう', 'xgame-text');
      both(s => ctx.zones[s].append(make('div', null, 'xgame-timer is-long')));
      function settle(ok) { if (tag !== nonce) return; nonce++; if (ok) { solved++; ctx.fx.correct(); } attempts++; turn = 1 - turn; next(); }
      ctx.button(turn, '当たった！', () => settle(true));
      ctx.button(turn, 'パス', () => settle(false));
      ctx.later(() => settle(false), CHARADE_MS);
    }
    return { start: next };
  });
})();

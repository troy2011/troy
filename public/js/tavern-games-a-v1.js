// Tavern games, set A: quick head-to-head races and eye tests, played at the same time in both halves.
// Each game gets a small context from tavern-expansion-v1.js (zones, timers, buttons, finish).
// Nothing here is saved or rewarded; the result only lives on this screen.
(() => {
  'use strict';
  const registry = window.tavernNewGames ??= [];
  const both = fn => { fn(0); fn(1); };
  const higher = (a, b) => (a === b ? null : Number(b > a));
  const shuffled = (ctx, list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = ctx.random(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  // A press pad that answers on touch-down, so two thumbs can hammer at once without waiting for click.
  function pad(ctx, seat, label, onPress, className = 'xgame-pad') {
    const button = make('button', label, 'xgame-action ' + className);
    button.type = 'button';
    button.addEventListener('pointerdown', event => { if (event.button === 0 && !button.disabled) onPress(); });
    button.addEventListener('click', event => { if (event.detail === 0 && !button.disabled) onPress(); });
    ctx.zones[seat].append(button);
    return button;
  }
  // 3, 2, 1 before a race, so nobody gets a head start by staring at the screen.
  function countdown(ctx, then) {
    const COUNT_STEP_MS = 600;
    [3, 2, 1].forEach((n, i) => ctx.later(() => { ctx.clear(); ctx.say(String(n)); both(s => ctx.text(s, String(n), 'xgame-big')); ctx.fx.turn(); }, i * COUNT_STEP_MS));
    ctx.later(then, 3 * COUNT_STEP_MS);
  }
  function add(id, name, category, icon, description, start) {
    registry.push({ id, name, category, icon, description, create: ctx => ({ start: () => start(ctx) }) });
  }

  // ---- 綱引き: tap to pull the rope to your side. ----
  const TUG_LIMIT = 15; // Taps of lead needed to pull the flag over.
  const TUG_TIME_MS = 12000;
  add('tug-of-war', '綱引き', 'reflex', '⚓', '連打で綱を引く。旗を自分の側まで引き込んだら勝ち。', ctx => {
    let rope = 0; // Negative: toward 1P. Positive: toward 2P.
    let open = false;
    const markers = [];
    countdown(ctx, () => {
      open = true;
      ctx.clear();
      ctx.say('引け！');
      both(seat => {
        const track = make('div', null, 'xgame-rope');
        track.append(make('span', 'あなた', 'xgame-rope-end is-mine'), make('span', '相手', 'xgame-rope-end is-theirs'));
        markers[seat] = make('span', '⚑', 'xgame-rope-flag');
        track.append(markers[seat]);
        ctx.zones[seat].append(track);
        pad(ctx, seat, '引く！', () => pull(seat));
      });
      draw();
      ctx.later(() => settle('時間切れ'), TUG_TIME_MS);
    });
    // Each half draws the rope with its own player on the left.
    function draw() {
      both(seat => {
        const towardMe = seat === 0 ? -rope : rope;
        markers[seat].style.left = 50 - (towardMe / TUG_LIMIT) * 45 + '%';
      });
    }
    function pull(seat) {
      if (!open) return;
      rope += seat === 0 ? -1 : 1;
      draw();
      if (Math.abs(rope) >= TUG_LIMIT) settle('引き切った！');
    }
    function settle(why) {
      if (!open) return;
      open = false;
      const winner = rope === 0 ? null : rope < 0 ? 0 : 1;
      ctx.finish(winner, why + (winner == null ? '　互角' : '　' + (winner + 1) + 'P の勝ち'));
    }
  });

  // ---- ドクロ爆弾: pass the bomb before the hidden fuse runs out. ----
  const BOMB_MIN_MS = 7000;
  const BOMB_SPREAD_MS = 8000;
  const BOMB_TICK_MS = 700;
  add('skull-bomb', 'ドクロ爆弾', 'luck', '💣', '光った的を2つ押すと相手へ渡せる。爆発したとき持っていたら負け。', ctx => {
    let holder = ctx.starter;
    let hits = 0;
    let live = true;
    const fuseMs = BOMB_MIN_MS + ctx.random(BOMB_SPREAD_MS);
    const lit = Date.now();
    function draw() {
      ctx.clear();
      ctx.turn(holder);
      ctx.say((holder + 1) + 'P が爆弾を持っている');
      both(seat => {
        if (seat !== holder) { ctx.text(seat, '相手が爆弾を持っている…', 'xgame-text'); ctx.text(seat, '💣', 'xgame-big is-calm'); return; }
        ctx.text(seat, '的を押して渡せ！（' + hits + ' / 2）', 'xgame-text');
        const field = make('div', null, 'xgame-field');
        const spot = make('button', '💣', 'xgame-action xgame-target');
        spot.type = 'button';
        spot.setAttribute('aria-label', '的');
        spot.style.left = 12 + ctx.random(76) + '%';
        spot.style.top = 15 + ctx.random(70) + '%';
        spot.addEventListener('click', () => hit(seat));
        field.append(spot);
        ctx.zones[seat].append(field);
      });
    }
    function hit(seat) {
      if (!live || seat !== holder) return;
      ctx.fx.tap();
      if (++hits < 2) { draw(); return; }
      hits = 0;
      holder = 1 - holder;
      draw();
    }
    // The fuse is hidden, but the ticking speeds up as it burns down.
    function tick() {
      if (!live) return;
      const left = fuseMs - (Date.now() - lit);
      if (left <= 0) { live = false; ctx.finish(1 - holder, '💥 ドカン！ ' + (holder + 1) + 'P の手の中で爆発'); return; }
      ctx.fx.tap();
      ctx.later(tick, Math.max(160, Math.min(BOMB_TICK_MS, left / 6)));
    }
    draw();
    tick();
  });

  // ---- Race questions: the same question in both halves, first correct answer scores. ----
  // A wrong answer locks that player out until the next question.
  function questionRace(ctx, { rounds, toWin, makeQuestion }) {
    const points = [0, 0];
    let question = null;
    let locked = [false, false];
    let n = 0;
    function next() {
      n++;
      if (n > rounds) { ctx.finish(higher(...points), points[0] + ' 対 ' + points[1]); return; }
      question = makeQuestion();
      locked = [false, false];
      draw();
    }
    function draw(note = '') {
      ctx.clear();
      ctx.say(note || '第 ' + n + ' 問　' + points[0] + ' 対 ' + points[1]);
      both(seat => {
        ctx.text(seat, 'あなた ' + points[seat] + ' 点　相手 ' + points[1 - seat] + ' 点', 'xgame-text');
        const prompt = make('p', question.prompt, 'xgame-big');
        if (question.colour) prompt.style.color = question.colour;
        ctx.zones[seat].append(prompt);
        const grid = make('div', null, 'xgame-grid is-two');
        question.choices.forEach(choice => {
          const button = make('button', choice.label, 'xgame-action');
          button.type = 'button';
          button.disabled = locked[seat];
          if (choice.swatch) button.style.setProperty('--swatch', choice.swatch);
          button.addEventListener('click', () => answer(seat, choice.value));
          grid.append(button);
        });
        ctx.zones[seat].append(grid);
        if (locked[seat]) ctx.text(seat, 'お手つき！ 次の問題まで待つ', 'xgame-text is-warn');
      });
    }
    function answer(seat, value) {
      if (!question || locked[seat]) return;
      if (value !== question.answer) {
        locked[seat] = true;
        ctx.fx.wrong();
        if (locked.every(Boolean)) { question = null; ctx.later(next, 700); draw('ふたりともお手つき'); return; }
        draw();
        return;
      }
      points[seat]++;
      ctx.fx.correct();
      question = null;
      if (points[seat] >= toWin) { ctx.finish(seat, points[0] + ' 対 ' + points[1]); return; }
      ctx.clear();
      ctx.say((seat + 1) + 'P 正解！');
      both(s => ctx.text(s, s === seat ? '正解！' : '相手が正解', 'xgame-big'));
      ctx.later(next, 700);
    }
    next();
  }

  add('quick-math', '早計算', 'reflex', '＋', '同じ計算が両側に出る。先に正しい答えを押した方が1点。3点先取。', ctx => {
    questionRace(ctx, {
      rounds: 9,
      toWin: 3,
      makeQuestion() {
        const times = ctx.random(3) === 0;
        const a = times ? 2 + ctx.random(8) : 11 + ctx.random(39);
        const b = times ? 2 + ctx.random(8) : 6 + ctx.random(39);
        const answer = times ? a * b : a + b;
        // Near misses make the choices worth reading.
        const wrong = shuffled(ctx, [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2].filter(v => v > 0)).slice(0, 3);
        return {
          prompt: a + (times ? ' × ' : ' ＋ ') + b,
          answer,
          choices: shuffled(ctx, [answer, ...wrong]).map(v => ({ label: String(v), value: v })),
        };
      },
    });
  });

  const INKS = [
    { name: '赤', css: '#ff6b5b' },
    { name: '青', css: '#6aa8ff' },
    { name: '黄', css: '#ffd84a' },
    { name: '緑', css: '#62d38a' },
  ];
  add('color-word', '色の早押し', 'reflex', '色', '文字ではなく「文字の色」を押す。先に当てた方が1点。3点先取。', ctx => {
    questionRace(ctx, {
      rounds: 9,
      toWin: 3,
      makeQuestion() {
        const word = ctx.random(INKS.length);
        const ink = (word + 1 + ctx.random(INKS.length - 1)) % INKS.length; // Never the same as the word.
        return {
          prompt: INKS[word].name,
          colour: INKS[ink].css,
          answer: ink,
          choices: INKS.map((c, i) => ({ label: c.name, value: i, swatch: c.css })),
        };
      },
    });
  });

  // ---- 数字タッチ: tap 1 to 9 in order, fastest wins. ----
  const TOUCH_PENALTY_MS = 900;
  add('number-touch', '数字タッチ', 'reflex', '①', 'ばらばらの1〜9を順番にタッチ。先に9まで押した方が勝ち。', ctx => {
    const layout = shuffled(ctx, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const next = [1, 1];
    const frozen = [false, false];
    countdown(ctx, () => { ctx.say('1から順に！'); draw(); });
    function draw() {
      ctx.clear();
      both(seat => {
        ctx.text(seat, frozen[seat] ? 'お手つき！ 少し待って' : '次：' + next[seat] + '　（相手は ' + Math.min(9, next[1 - seat]) + ' 番）', frozen[seat] ? 'xgame-text is-warn' : 'xgame-text');
        const grid = make('div', null, 'xgame-grid is-three');
        layout.forEach(n => {
          const button = make('button', String(n), 'xgame-action');
          button.type = 'button';
          button.disabled = n < next[seat] || frozen[seat];
          button.addEventListener('pointerdown', event => { if (event.button === 0) touch(seat, n); });
          button.addEventListener('click', event => { if (event.detail === 0) touch(seat, n); });
          grid.append(button);
        });
        ctx.zones[seat].append(grid);
      });
    }
    function touch(seat, n) {
      if (frozen[seat] || n < next[seat]) return;
      if (n !== next[seat]) {
        frozen[seat] = true;
        ctx.fx.wrong();
        draw();
        ctx.later(() => { frozen[seat] = false; draw(); }, TOUCH_PENALTY_MS);
        return;
      }
      ctx.fx.tap();
      if (++next[seat] > 9) { ctx.finish(seat, (seat + 1) + 'P が先に9まで'); return; }
      draw();
    }
  });

  // ---- 大砲の力加減: stop a swinging gauge in the target band, three shots, closest total wins. ----
  const CANNON_SHOTS = 3;
  const CANNON_FRAME_MS = 30;
  const CANNON_SWEEP_MS = [1500, 1150, 850]; // Each shot the gauge swings faster.
  add('cannon-power', '大砲の力加減', 'timing', '◎', '往復するゲージを、目標の位置で止める。3発の誤差の合計が小さい方が勝ち。', ctx => {
    const miss = [0, 0];
    let shot = 0;
    let target = 0;
    let stops = [null, null];
    let started = 0;
    const needles = [];
    function fire() {
      target = 20 + ctx.random(61);
      stops = [null, null];
      started = Date.now();
      ctx.clear();
      ctx.say('第 ' + (shot + 1) + ' 発　金の帯で止めろ');
      both(seat => {
        ctx.text(seat, '第 ' + (shot + 1) + ' / ' + CANNON_SHOTS + ' 発　誤差の合計 ' + miss[seat], 'xgame-text');
        const gauge = make('div', null, 'xgame-gauge');
        const band = make('span', null, 'xgame-gauge-band');
        band.style.left = target + '%';
        needles[seat] = make('span', null, 'xgame-gauge-needle');
        gauge.append(band, needles[seat]);
        ctx.zones[seat].append(gauge);
        pad(ctx, seat, '撃つ！', () => stop(seat));
      });
      sweep();
    }
    const position = () => {
      const period = CANNON_SWEEP_MS[shot];
      const t = ((Date.now() - started) % (2 * period)) / period;
      return Math.round((t <= 1 ? t : 2 - t) * 100);
    };
    function sweep() {
      if (stops.every(v => v != null)) return;
      const now = position();
      both(seat => { needles[seat].style.left = (stops[seat] ?? now) + '%'; });
      ctx.later(sweep, CANNON_FRAME_MS);
    }
    function stop(seat) {
      if (stops[seat] != null) return;
      stops[seat] = position();
      needles[seat].style.left = stops[seat] + '%';
      needles[seat].classList.add('is-stopped');
      ctx.fx.tap();
      if (stops.some(v => v == null)) return;
      stops.forEach((v, s) => { miss[s] += Math.abs(target - v); });
      shot++;
      ctx.say('目標 ' + target + '　1P ' + stops[0] + '　2P ' + stops[1]);
      if (shot === CANNON_SHOTS) { ctx.later(() => ctx.finish(higher(-miss[0], -miss[1]), '誤差の合計　1P ' + miss[0] + '　2P ' + miss[1]), 900); return; }
      ctx.later(fire, 1100);
    }
    fire();
  });

  // ---- 貝殻の数当て: count scattered shells in a flash, three rounds. ----
  const SHELL_ROUNDS = 3;
  const SHELL_SHOW_MS = [1400, 1100, 850];
  add('shell-count', '貝殻の数当て', 'memory', '🐚', '一瞬ばらまかれる貝殻を数える。ぴったり2点、1つ違いで1点。3回勝負。', ctx => {
    const points = [0, 0];
    let round = 0;
    let count = 0;
    let answers = [null, null];
    function scatter() {
      count = 6 + ctx.random(7) + round;
      answers = [null, null];
      // The same scatter in both halves, so the count is equally hard for each player.
      const spots = Array.from({ length: count }, (_, i) => ({ left: 8 + ((i * 37 + ctx.random(30)) % 84), top: 10 + ((i * 53 + ctx.random(40)) % 78) }));
      ctx.clear();
      ctx.say('第 ' + (round + 1) + ' 回　数えて！');
      both(seat => {
        const field = make('div', null, 'xgame-field');
        spots.forEach(spot => {
          const shell = make('span', '🐚', 'xgame-shell');
          shell.style.left = spot.left + '%';
          shell.style.top = spot.top + '%';
          field.append(shell);
        });
        ctx.zones[seat].append(field);
      });
      ctx.later(ask, SHELL_SHOW_MS[round]);
    }
    function ask() {
      ctx.clear();
      ctx.say('貝殻は何個？');
      const low = Math.max(1, count - 2 - ctx.random(3));
      both(seat => {
        ctx.text(seat, answers[seat] == null ? '貝殻は何個？' : answers[seat] + ' 個と答えた', 'xgame-text');
        const grid = make('div', null, 'xgame-grid is-three');
        for (let v = low; v < low + 6; v++) {
          const button = make('button', String(v), 'xgame-action');
          button.type = 'button';
          button.disabled = answers[seat] != null;
          button.addEventListener('click', () => answer(seat, v));
          grid.append(button);
        }
        ctx.zones[seat].append(grid);
      });
    }
    function answer(seat, value) {
      if (answers[seat] != null) return;
      answers[seat] = value;
      ctx.fx.tap();
      if (answers.some(v => v == null)) {
        // Only this half changes, so the other player is not distracted.
        ctx.zones[seat].querySelectorAll('button').forEach(b => { b.disabled = true; });
        ctx.zones[seat].querySelector('.xgame-text').textContent = value + ' 個と答えた';
        return;
      }
      answers.forEach((v, s) => { points[s] += v === count ? 2 : Math.abs(v - count) === 1 ? 1 : 0; });
      round++;
      ctx.clear();
      ctx.say('正解 ' + count + ' 個　' + points[0] + ' 対 ' + points[1]);
      both(s => ctx.text(s, '正解 ' + count + ' 個（あなた ' + answers[s] + '）', 'xgame-big'));
      if (round === SHELL_ROUNDS) { ctx.later(() => ctx.finish(higher(...points), '正解 ' + count + ' 個　合計 ' + points[0] + ' 対 ' + points[1]), 1000); return; }
      ctx.later(scatter, 1300);
    }
    scatter();
  });

  // ---- 宝箱シャッフル: barrels slide around; keep your eye on the one with the coin. ----
  const SHUFFLE_ROUNDS = 3;
  const SHUFFLE_SWAPS = [4, 6, 8];
  const SHUFFLE_STEP_MS = [620, 480, 360];
  add('chest-shuffle', '宝箱シャッフル', 'memory', '▣', '金貨の入った樽を目で追う。当てたら1点。だんだん速くなる3回勝負。', ctx => {
    const points = [0, 0];
    let round = 0;
    let slots = [0, 1, 2]; // slots[barrel] = position 0..2
    let coin = 0;
    let picks = [null, null];
    const barrels = [[], []];
    function drawBarrels(showCoin, pickable) {
      ctx.clear();
      both(seat => {
        ctx.text(seat, 'あなた ' + points[seat] + ' 点　相手 ' + points[1 - seat] + ' 点', 'xgame-text');
        const field = make('div', null, 'xgame-field is-row');
        [0, 1, 2].forEach(barrel => {
          const node = make('button', showCoin && barrel === coin ? '🪙' : '🛢', 'xgame-action xgame-barrel');
          node.type = 'button';
          node.disabled = !pickable || picks[seat] != null;
          node.style.left = 18 + slots[barrel] * 32 + '%';
          node.setAttribute('aria-label', ['左', '中央', '右'][slots[barrel]] + 'の樽');
          node.addEventListener('click', () => pick(seat, barrel));
          barrels[seat][barrel] = node;
          field.append(node);
        });
        ctx.zones[seat].append(field);
      });
    }
    function play() {
      slots = [0, 1, 2];
      coin = ctx.random(3);
      picks = [null, null];
      drawBarrels(true, false);
      ctx.say('第 ' + (round + 1) + ' 回　金貨の樽を覚えて');
      const step = SHUFFLE_STEP_MS[round];
      // The coin is covered a moment before the first swap, so the barrels are on screen when they start to slide.
      ctx.later(() => { drawBarrels(false, false); ctx.say('目を離すな！'); }, 900);
      for (let i = 0; i < SHUFFLE_SWAPS[round]; i++) {
        ctx.later(() => {
          const a = ctx.random(3), b = (a + 1 + ctx.random(2)) % 3;
          [slots[a], slots[b]] = [slots[b], slots[a]];
          both(seat => [0, 1, 2].forEach(barrel => {
            barrels[seat][barrel].style.setProperty('--slide-ms', step - 60 + 'ms');
            barrels[seat][barrel].style.left = 18 + slots[barrel] * 32 + '%';
          }));
          ctx.fx.tap();
        }, 1100 + i * step);
      }
      ctx.later(() => { drawBarrels(false, true); ctx.say('金貨はどの樽？'); }, 1100 + SHUFFLE_SWAPS[round] * step + 150);
    }
    function pick(seat, barrel) {
      if (picks[seat] != null) return;
      picks[seat] = barrel;
      ctx.fx.tap();
      barrels[seat].forEach(b => { b.disabled = true; });
      barrels[seat][barrel].classList.add('is-picked');
      if (picks.some(p => p == null)) return;
      picks.forEach((p, s) => { if (p === coin) points[s]++; });
      round++;
      drawBarrels(true, false);
      picks.forEach((p, s) => barrels[s][p].classList.add(p === coin ? 'is-right' : 'is-wrong'));
      ctx.say('金貨は ' + ['左', '中央', '右'][slots[coin]] + '　' + points[0] + ' 対 ' + points[1]);
      if (round === SHUFFLE_ROUNDS) { ctx.later(() => ctx.finish(higher(...points), '合計 ' + points[0] + ' 対 ' + points[1]), 1100); return; }
      ctx.later(play, 1400);
    }
    play();
  });
})();

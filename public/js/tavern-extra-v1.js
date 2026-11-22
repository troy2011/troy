// The four turn-based and puzzle games of the tavern set: 31の呪い, 偽旗を見破れ, 光る順番, コインカーリング.
// Two players share one phone, so each half shows everything its player needs the right way up:
// whose turn it is, the shared message, and a large 勝ち / 負け at the end.
// Results stay on this screen only; nothing here is saved or rewarded.
(() => {
  'use strict';
  const GAMES = {
    flags: ['偽旗を見破れ', 'reflex', '⚑', 'お題と同じ旗を先に見つけて3点先取。'],
    memory: ['光る順番', 'memory', '✦', '同じ順番を覚えて、それぞれ再現。'],
    curling: ['コインカーリング', 'strategy', '◎', '交互に3投。コインを弾いて、中心に近いほうが勝ち。'],
  };
  const NAMES = ['1P', '2P'];
  const START_PROMPT = '「開始」を押すと始まります';
  const SHAPES = ['●', '▲', '◆', '■'];
  const COLOURS = ['赤', '青', '金', '緑'];

  const FLAG_POINTS_TO_WIN = 3;
  const FLAG_NEXT_TARGET_MS = 450;
  const MEMORY_LENGTH = 4;
  const MEMORY_FIRST_CUE_MS = 300;
  const MEMORY_CUE_STEP_MS = 680;
  const MEMORY_CUE_SHOW_MS = 430;
  const THROWS_PER_PLAYER = 3;
  // Curling lane positions are percentages of the lane, 0 at the throwing end and 50 at the centre of the target.
  const LANE_TARGET = 50;
  const LANE_START = 8;
  const LANE_THROW_LINE = 30; // The coin may be dragged up to here; past it, it is in flight.
  const FLICK_RANGE_MS = 150; // How far a flick carries: lane-% per ms of release speed, times this.
  const FLICK_MIN_SPEED = 0.02; // Slower than this is a nudge, not a throw.
  const FLICK_SAMPLE_MS = 110; // Release speed is measured over the last moments of the drag.
  const FLICK_WOBBLE = 2; // A little unevenness in the felt, so the same flick never lands twice in the same spot.
  const FLICK_HOW_TO = 'コインを右へ弾く（点線より手前で離す）';
  const KEYBOARD_POWER_STEP = 3;
  const KEYBOARD_REACH = 0.92; // Lane-% travelled per point of keyboard power.
  const SLIDE_MS_PER_PERCENT = 11;
  const SLIDE_MAX_MS = 900;

  const fx = window.tavernFx;
  const arena = document.getElementById('arena');
  const startButton = document.getElementById('start');
  const zones = [...arena.querySelectorAll('.player')].map((pressButton, seat) => {
    const zone = document.createElement('section');
    zone.className = 'player extra ' + (seat ? 'b' : 'a');
    zone.setAttribute('aria-label', NAMES[seat]);
    zone.hidden = true;
    pressButton.after(zone);
    return zone;
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let id = null;
  let phase = 'idle';
  let round = 0;
  let turn = 0;
  let winner = null;
  let note = '';
  let timers = [];
  // 31の呪い
  // 偽旗を見破れ
  let points = [0, 0];
  let target = 0;
  let flagOrder = [0, 1, 2, 3];
  let wrongFlags = [new Set(), new Set()];
  let scorer = null; // Who found the last flag: their half flashes until the next target.
  // 光る順番
  let pattern = [];
  let guesses = [[], []];
  let cue = -1;
  // コインカーリング
  let throws = [0, 0];
  let landings = [[], []]; // Every coin that stayed on the lane, per player.
  let best = [Infinity, Infinity]; // Closest distance to the centre, in tenths of a lane-%.
  let power = [0, 0];
  let drag = null;

  const random = n => Math.floor(Math.random() * n);
  const flagName = v => SHAPES[v] + ' ' + COLOURS[v];

  function cancel() {
    timers.forEach(clearTimeout);
    timers = [];
    drag = null;
  }
  function defer(fn, ms) {
    const timer = setTimeout(() => { timers = timers.filter(t => t !== timer); fn(); }, ms);
    timers.push(timer);
  }
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function actionButton(text, onClick, disabled = false) {
    const button = el('button', text);
    button.type = 'button';
    button.disabled = disabled;
    button.onclick = onClick;
    return button;
  }
  function setSignal(text) { document.getElementById('signal').textContent = text; }

  function finish(seat) {
    cancel();
    winner = seat;
    phase = 'done';
    note = seat == null ? '引き分け' : NAMES[seat] + ' の勝ち';
    fx.record(seat);
    fx.result(seat);
    render();
  }

  // ---- Drawing ----

  function render() {
    arena.dataset.phase = phase;
    startButton.disabled = phase !== 'idle' && phase !== 'done';
    startButton.textContent = phase === 'done' ? '再戦' : '開始';
    setSignal(note);
    zones.forEach((zone, seat) => {
      // Re-drawing replaces the buttons; keep keyboard focus on the same control.
      const focused = zone.contains(document.activeElement) ? labelOf(document.activeElement) : null;
      const wins = fx.wins(seat);
      zone.replaceChildren(el('div', NAMES[seat] + (wins ? '　' + wins + '勝' : ''), 'seat'));
      zone.dataset.flash = phase === 'pause' && scorer === seat ? 'correct' : '';
      zone.dataset.result = phase === 'done' && winner != null ? (winner === seat ? 'win' : 'lose') : '';
      zone.dataset.turn = turnState(seat);
      if (phase === 'idle') drawIdle(zone, seat);
      else if (phase === 'done') drawDone(zone, seat);
      else if (id === 'flags') drawFlags(zone, seat);
      else if (id === 'memory') drawMemory(zone, seat);
      else if (id === 'curling') drawCurling(zone, seat);
      if (focused) [...zone.querySelectorAll('button:not(:disabled)')].find(b => labelOf(b) === focused)?.focus({ preventScroll: true });
    });
  }
  const labelOf = node => node.getAttribute('aria-label') || node.textContent;
  const turnBased = () => id === 'curling';
  function turnState(seat) {
    if (!turnBased() || (phase !== 'play' && phase !== 'sliding')) return '';
    return turn === seat ? 'mine' : 'theirs';
  }
  function say(zone, text) { if (text) zone.append(el('p', text, 'say')); }

  function drawIdle(zone, seat) {
    zone.append(el('strong', GAMES[id][0]), el('small', GAMES[id][3]));
    const first = turnBased() ? (round % 2 === seat ? 'あなたが先攻' : '相手が先攻') : '';
    say(zone, [first, START_PROMPT, hintText()].filter(Boolean).join('\n'));
  }

  function drawDone(zone, seat) {
    zone.append(el('strong', winner == null ? '引き分け' : winner === seat ? '勝ち' : '負け'));
    let detail = '';
    if (id === 'flags') detail = points[seat] + ' 点';
    if (id === 'memory') detail = score(seat) + ' / ' + pattern.length + ' 正解';
    if (id === 'curling') detail = '投数 ' + throws[seat] + '/' + THROWS_PER_PLAYER + '　中心まで ' + distanceText(best[seat]);
    zone.append(el('small', detail));
    if (id === 'curling') zone.append(curlingLane(seat, false));
    // The answer is shown after the round, so both can see where they slipped.
    say(zone, id === 'memory' ? note + '\n正解　' + pattern.map(v => SHAPES[v]).join(' ') : note);
  }

  function drawFlags(zone, seat) {
    zone.append(el('strong', '探せ：' + flagName(target), 'flag-target'));
    const status = wrongFlags[seat].size ? '　違う旗！' : phase === 'pause' ? '　次のお題へ…' : '';
    zone.append(el('small', points[seat] + ' 点' + status));
    const actions = el('div', null, 'extra-actions');
    flagOrder.forEach(flag => {
      const button = actionButton(flagName(flag), () => chooseFlag(seat, flag), phase !== 'play' || wrongFlags[seat].has(flag));
      button.dataset.tone = String(flag);
      actions.append(button);
    });
    zone.append(actions);
    say(zone, note);
  }
  function shuffleFlags() {
    flagOrder = [0, 1, 2, 3];
    for (let i = flagOrder.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [flagOrder[i], flagOrder[j]] = [flagOrder[j], flagOrder[i]];
    }
  }
  function chooseFlag(seat, flag) {
    if (phase !== 'play') return;
    // A wrong flag never scores; it only locks that flag for this player until the next target.
    if (flag !== target) { wrongFlags[seat].add(flag); fx.wrong(); render(); return; }
    if (++points[seat] === FLAG_POINTS_TO_WIN) { finish(seat); return; }
    phase = 'pause';
    scorer = seat;
    fx.correct();
    note = NAMES[seat] + ' 正解！';
    render();
    defer(() => {
      target = (target + 1 + random(3)) % SHAPES.length;
      shuffleFlags();
      wrongFlags = [new Set(), new Set()];
      phase = 'play';
      note = '同じ旗を押せ';
      render();
    }, FLAG_NEXT_TARGET_MS);
  }

  function drawMemory(zone, seat) {
    const guess = guesses[seat];
    if (phase === 'show') {
      zone.append(el('strong', cue < 0 ? '覚えて' : SHAPES[cue], cue < 0 ? '' : 'cue'), el('small', '同じ合図が両側に出ます'));
    } else {
      zone.append(el('strong', guess.length >= pattern.length ? '入力完了' : '順番を再現'), el('small', guess.length + ' / ' + pattern.length));
    }
    const actions = el('div', null, 'extra-actions');
    SHAPES.forEach((shape, value) => actions.append(actionButton(shape, () => guessMemory(seat, value), phase !== 'play' || guess.length >= pattern.length)));
    zone.append(actions);
    say(zone, guess.length >= pattern.length && phase === 'play' ? '相手の入力を待っています' : note);
  }
  function guessMemory(seat, value) {
    const guess = guesses[seat];
    if (phase !== 'play' || guess.length >= pattern.length) return;
    guess.push(value);
    if (guesses.every(g => g.length === pattern.length)) {
      const [a, b] = [score(0), score(1)];
      finish(a === b ? null : Number(b > a));
    } else render();
  }
  const score = seat => guesses[seat].filter((g, i) => g === pattern[i]).length;

  // ---- コインカーリング ----

  const distanceOf = x => Math.round(Math.abs(LANE_TARGET - x) * 10);
  const distanceText = d => (Number.isFinite(d) ? (d / 10).toFixed(1) : '—');

  function drawCurling(zone, seat) {
    const mine = turn === seat;
    zone.append(
      el('strong', mine ? (phase === 'sliding' ? '…' : 'あなたの番') : '相手の番'),
      el('small', '投数 ' + throws[seat] + '/' + THROWS_PER_PLAYER + '　中心まで ' + distanceText(best[seat])),
      curlingLane(seat, mine && phase === 'play', mine && phase === 'sliding'),
    );
    say(zone, mine && phase === 'play' ? [note, FLICK_HOW_TO].filter(Boolean).join('\n') : note);
  }

  // Each half draws the same lane, with this player's coins in gold and the opponent's in blue.
  function curlingLane(seat, canThrow, sliding = false) {
    const lane = el('div', null, 'curl-lane');
    lane.setAttribute('aria-label', 'レーン。中央の的に近いコインほど良い');
    for (const owner of [seat, 1 - seat]) {
      landings[owner].forEach(x => {
        const mark = el('span', null, 'curl-landing ' + (owner === seat ? 'is-mine' : 'is-theirs') + (distanceOf(x) === best[owner] ? ' is-best' : ''));
        mark.style.left = x + '%';
        mark.setAttribute('aria-hidden', 'true');
        lane.append(mark);
      });
    }
    // Only the coin in play is shown: the thrower's while aiming or sliding.
    const coin = actionButton('コイン', () => {}, !canThrow && !sliding);
    coin.className = 'curl-coin';
    coin.style.left = LANE_START + '%';
    coin.setAttribute('aria-label', 'コイン。左右の矢印で強さ（今 ' + power[seat] + '）、Enter かスペースで投げる');
    if (canThrow) wireCoin(coin, lane, seat);
    lane.append(coin);
    return lane;
  }

  function wireCoin(coin, lane, seat) {
    // Project the pointer into the lane’s horizontal axis after either board rotation.
    const laneX = event => {
      const box = lane.getBoundingClientRect();
      if (arena.dataset.layout === 'counter' && matchMedia('(orientation: portrait)').matches) {
        return (100 * (event.clientY - box.top)) / box.height;
      }
      const x = (100 * (event.clientX - box.left)) / box.width;
      return arena.dataset.layout === 'table' && seat === 0 ? 100 - x : x;
    };
    const place = x => { coin.style.left = Math.max(0, Math.min(LANE_THROW_LINE, x)) + '%'; };
    coin.onpointerdown = event => {
      if (drag || event.button !== 0) return;
      drag = { coin, pointer: event.pointerId, samples: [{ x: laneX(event), t: event.timeStamp }] };
      coin.setPointerCapture(event.pointerId);
    };
    coin.onpointermove = event => {
      if (drag?.pointer !== event.pointerId) return;
      const x = laneX(event);
      drag.samples.push({ x, t: event.timeStamp });
      drag.samples = drag.samples.filter(s => event.timeStamp - s.t <= FLICK_SAMPLE_MS);
      place(x);
      // Crossing the line lets go of the coin, as a real throw would.
      if (x >= LANE_THROW_LINE) release(event);
    };
    const release = event => {
      if (drag?.pointer !== event.pointerId) return;
      const samples = drag.samples.filter(s => event.timeStamp - s.t <= FLICK_SAMPLE_MS);
      drag = null;
      const first = samples[0], last = samples[samples.length - 1];
      const speed = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      const from = Math.max(0, Math.min(LANE_THROW_LINE, last?.x ?? LANE_START));
      if (speed < FLICK_MIN_SPEED) { note = 'もっと勢いよく右へ弾いて'; render(); return; }
      throwCoin(seat, from, speed * FLICK_RANGE_MS);
    };
    coin.onpointerup = release;
    coin.onpointercancel = coin.onlostpointercapture = event => {
      if (drag?.coin === coin && drag.pointer === event.pointerId) { drag = null; place(LANE_START); }
    };
    coin.onkeydown = event => {
      const step = { ArrowLeft: -KEYBOARD_POWER_STEP, ArrowRight: KEYBOARD_POWER_STEP }[event.key];
      if (step) {
        event.preventDefault();
        power[seat] = Math.max(0, Math.min(100, power[seat] + step));
        coin.setAttribute('aria-label', 'コイン。左右の矢印で強さ（今 ' + power[seat] + '）、Enter かスペースで投げる');
        note = '強さ ' + power[seat];
        setSignal(note);
        zones[seat].querySelector('.say').textContent = note;
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        throwCoin(seat, LANE_START, power[seat] * KEYBOARD_REACH);
      }
    };
  }

  function throwCoin(seat, from, travel) {
    if (phase !== 'play' || turn !== seat) return;
    const wobble = (Math.random() - 0.5) * FLICK_WOBBLE;
    const stop = from + travel + wobble;
    const onLane = stop <= 100;
    phase = 'sliding';
    note = '';
    render();
    const coin = zones[seat].querySelector('.curl-coin');
    const slideMs = reducedMotion.matches ? 0 : Math.min(SLIDE_MAX_MS, Math.abs(stop - from) * SLIDE_MS_PER_PERCENT);
    coin.style.left = from + '%';
    coin.style.setProperty('--slide-ms', slideMs + 'ms');
    void coin.offsetWidth; // Start the slide from the release point.
    coin.classList.add('is-sliding');
    coin.style.left = Math.min(104, stop) + '%';
    defer(() => settleCoin(seat, onLane ? stop : null), slideMs);
  }

  function settleCoin(seat, stop) {
    throws[seat]++;
    if (stop == null) { note = NAMES[seat] + ' 場外！'; fx.wrong(); }
    else {
      fx.coinRest();
      landings[seat].push(stop);
      best[seat] = Math.min(best[seat], distanceOf(stop));
      note = NAMES[seat] + '　中心まで ' + distanceText(distanceOf(stop));
    }
    phase = 'play';
    if (throws.every(n => n === THROWS_PER_PLAYER)) {
      const [a, b] = best;
      finish(a === b ? null : Number(b < a));
      return;
    }
    turn = 1 - seat;
    render();
  }

  // ---- Round control ----

  function hintText() {
    const portrait = matchMedia('(orientation: portrait)').matches;
    if (arena.dataset.layout === 'table' && !portrait) return '縦向きがおすすめ';
    return '';
  }

  function reset(reason = '') {
    cancel();
    phase = 'idle';
    winner = null;
    note = reason || GAMES[id][3];
    render();
  }

  function begin() {
    if (phase !== 'idle' && phase !== 'done') return;
    cancel();
    winner = null;
    phase = 'play';
    // The first player alternates between games, so a rematch is fair.
    turn = round++ % 2;
    scorer = null;
    points = [0, 0];
    target = random(SHAPES.length);
    shuffleFlags();
    wrongFlags = [new Set(), new Set()];
    pattern = Array.from({ length: MEMORY_LENGTH }, () => random(SHAPES.length));
    guesses = [[], []];
    throws = [0, 0];
    landings = [[], []];
    best = [Infinity, Infinity];
    power = [0, 0];
    note = { flags: '同じ旗を押せ', curling: '中心に近いほうが勝ち', memory: '合図を覚えよう' }[id];
    if (id === 'memory') {
      phase = 'show';
      cue = -1;
      pattern.forEach((value, i) => {
        defer(() => { cue = value; fx.cue(); render(); }, MEMORY_FIRST_CUE_MS + i * MEMORY_CUE_STEP_MS);
        defer(() => { cue = -1; render(); }, MEMORY_FIRST_CUE_MS + MEMORY_CUE_SHOW_MS + i * MEMORY_CUE_STEP_MS);
      });
      defer(() => { phase = 'play'; note = '順番を再現'; render(); }, MEMORY_FIRST_CUE_MS + pattern.length * MEMORY_CUE_STEP_MS);
    }
    render();
  }

  window.tavernExtra = {
    entries: Object.entries(GAMES).map(([gameId, [name, category, icon, description]]) => ({ id: gameId, name, category, icon, description })),
    select(game) {
      id = GAMES[game] ? game : null;
      zones.forEach(zone => { zone.hidden = !id; });
      if (id) { round = 0; arena.dataset.extra = id; reset(); }
      else delete arena.dataset.extra;
      return !!id;
    },
    update() {
      if (!id) return;
      if (drag) {
        // A held coin cannot carry velocity across a change of coordinate axes.
        const { coin, pointer } = drag;
        drag = null;
        coin.style.left = LANE_START + '%';
        if (coin.hasPointerCapture(pointer)) coin.releasePointerCapture(pointer);
      }
      document.getElementById('hint').textContent = hintText();
      if (phase === 'idle') render();
    },
    handles() { return !!id; },
    reset,
    begin,
    clear() {
      cancel();
      id = null;
      zones.forEach(zone => { zone.hidden = true; });
      delete arena.dataset.extra;
    },
  };
})();

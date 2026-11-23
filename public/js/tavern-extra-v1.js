// The four turn-based and puzzle games of the tavern set: 31の呪い, 偽旗を見破れ, 光る順番, コインカーリング.
// Two players share one phone, so each half shows everything its player needs the right way up:
// whose turn it is, the shared message, and a large 勝ち / 負け at the end.
// Results stay on this screen only; nothing here is saved or rewarded.
(() => {
  'use strict';
  const GAMES = {
    memory: ['光る順番', 'memory', '💎', '同じ順番を覚えて、それぞれ再現。'],
    curling: ['コインカーリング', 'strategy', '🪙', '交互に3投。コインを弾いて、中心に近いほうが勝ち。'],
  };
  const NAMES = ['1P', '2P'];
  const START_PROMPT = '「開始」を押すと始まります';
  const SHAPES = ['●', '▲', '◆', '■'];

  const MEMORY_GEMS = ['aqua', 'ruby', 'amber', 'emerald'];

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
  const FLICK_HOW_TO = '的に向けてはじく（斜めも可）';
  const KEYBOARD_POWER_STEP = 3;
  const KEYBOARD_REACH = 0.92; // Lane-% travelled per point of keyboard power.

  const fx = window.tavernFx;
  const curl = window.tavernCurlPhysics;
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
  // 光る順番
  let pattern = [];
  let guesses = [[], []];
  let cue = -1, cueStep = 0;
  // コインカーリング
  let throws = [0, 0];
  let shotHistory = [[], []];
  let landings = []; // Stable shared positions keyed by owner and shot number.
  let best = [Infinity, Infinity]; // Closest distance to the centre, in tenths of a lane-%.
  let power = [0, 0], aim = [0, 0];
  let drag = null, curlMetric = null;

  const random = n => Math.floor(Math.random() * n);

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

  let memoryStage = null;
  function renderMemoryStage() {
    if (id !== 'memory') { memoryStage?.remove(); return; }
    if (!memoryStage) {
      memoryStage = el('div', null, 'memory-stage');
      memoryStage.setAttribute('aria-hidden', 'true');
      memoryStage.append(el('p', '', 'memory-stage-heading'));
      const plate = el('div', null, 'memory-plate');
      SHAPES.forEach((shape, value) => {
        const node = el('span', shape, 'memory-gem');
        node.dataset.gem = MEMORY_GEMS[value];
        plate.append(node);
      });
      memoryStage.append(plate);
    }
    if (!memoryStage.isConnected) arena.querySelector('.deck').append(memoryStage);
    memoryStage.hidden = phase === 'play';
    memoryStage.firstElementChild.textContent = phase === 'done' ? '順番をふり返る' : '順番を覚えて';
    for (const [i, node] of [...memoryStage.lastElementChild.children].entries()) {
      node.classList.toggle('is-lit', phase === 'show' && i === cue);
    }
  }

  function render() {
    arena.dataset.phase = phase;
    renderMemoryStage();
    startButton.disabled = phase !== 'idle' && phase !== 'done';
    startButton.textContent = phase === 'done' ? '再戦' : '開始';
    setSignal(note);
    zones.forEach((zone, seat) => {
      // Re-drawing replaces the buttons; keep keyboard focus on the same control.
      const focused = zone.contains(document.activeElement) ? labelOf(document.activeElement) : null;
      const wins = fx.wins(seat);
      zone.replaceChildren(el('div', NAMES[seat] + (wins ? '　' + wins + '勝' : ''), 'seat'));
      zone.dataset.result = phase === 'done' && winner != null ? (winner === seat ? 'win' : 'lose') : '';
      zone.dataset.turn = turnState(seat);
      if (phase === 'idle') drawIdle(zone, seat);
      else if (phase === 'done') drawDone(zone, seat);
      else if (id === 'memory') drawMemory(zone, seat);
      else if (id === 'curling') drawCurling(zone, seat);
      if (focused) [...zone.querySelectorAll('button:not(:disabled)')].find(b => labelOf(b) === focused)?.focus({ preventScroll: true });
      if (id === 'curling') {
        const panel = el('div', null, 'curl-panel');
        const lane = zone.querySelector('.curl-lane');
        for (const child of [...zone.children]) if (child !== lane) panel.append(child);
        zone.prepend(panel);
      }
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
    if (id === 'curling') zone.append(curlingLane(seat, false));
  }

  function drawDone(zone, seat) {
    zone.append(el('strong', winner == null ? '引き分け' : winner === seat ? '勝ち' : '負け'));
    let detail = '';
    if (id === 'memory') detail = score(seat) + ' / ' + pattern.length + ' 正解';
    if (id === 'curling') detail = '投数 ' + throws[seat] + '/' + THROWS_PER_PLAYER + '\n盤上最短 ' + distanceText(best[seat]);
    zone.append(el('small', detail));
    if (id === 'curling') zone.append(curlingLane(seat, false), renderCurlingShots(seat));
    // The answer is shown after the round, so both can see where they slipped.
    say(zone, id === 'memory' ? note + '\n正解　' + pattern.map(v => SHAPES[v]).join(' ') : note);
  }

  function progressStrip(values, cls, label) {
    const strip = el('div', null, 'tavern-progress-strip ' + cls);
    strip.setAttribute('role', 'img'); strip.setAttribute('aria-label', label);
    for (const [name, state] of values) {
      const marker = el('span', name);
      marker.dataset.state = state;
      marker.setAttribute('aria-hidden', 'true');
      strip.append(marker);
    }
    return strip;
  }

  function drawMemory(zone, seat) {
    const guess = guesses[seat];
    if (phase === 'show') {
      zone.append(el('strong', cue < 0 ? '覚えて' : SHAPES[cue], cue < 0 ? '' : 'cue'), el('small', '同じ合図が両側に出ます'));
    } else {
      zone.append(el('strong', guess.length >= pattern.length ? '入力完了' : '順番を再現'), el('small', guess.length + ' / ' + pattern.length));
    }
    if (phase === 'play') {
      const actions = el('div', null, 'extra-actions memory-plate');
      SHAPES.forEach((shape, value) => {
        const button = actionButton(shape, () => guessMemory(seat, value), guess.length >= pattern.length);
        button.classList.add('memory-gem');
        button.dataset.gem = MEMORY_GEMS[value];
        actions.append(button);
      });
      zone.append(actions);
    }
    const active = phase === 'show' ? cueStep : guess.length;
    zone.append(progressStrip(pattern.map((_, i) => [String(i + 1), i < active ? 'used' : i === active ? 'next' : 'open']),
      'tavern-memory-progress', (phase === 'show' ? '見る ' : '入力 ') + active + ' / ' + pattern.length));
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

  // ---- Coin curling: one shared 2D board ----
  const distanceText = d => Number.isFinite(d) ? (d / 10).toFixed(1) : '—';
  const launchSign = seat => arena.dataset.layout === 'table' && !matchMedia('(orientation: portrait)').matches
    ? (seat ? 1 : -1) : (seat ? -1 : 1);
  const extent = (n, min, max) => Math.max(min, Math.min(max, n));
  const startPoint = seat => ({ x: launchSign(seat) > 0 ? LANE_START : 100 - LANE_START, y: curl.HEIGHT / 2 });
  const placePiece = (node, p) => {
    node.style.setProperty('--curl-world-x', p.x + '%');
    node.style.setProperty('--curl-world-y', p.y * 100 / curl.HEIGHT + '%');
  };
  // Fix a round's physical scale to its opening orientation so rotating later does not
  // retroactively change an already-landed coin's points.
  function boardMetric(lane) {
    const box = lane.getBoundingClientRect();
    const portrait = matchMedia('(orientation: portrait)').matches;
    const along = portrait ? box.height : box.width, cross = portrait ? box.width : box.height;
    return { lateral: cross / along * curl.WIDTH / curl.HEIGHT,
      radius: extent(Math.min(along * .06, cross * .10), 12, 35) / 2 * curl.WIDTH / along };
  }
  const curlDistance = p => curl.distance(p, curlMetric?.lateral);
  const labels = seat => 'コイン。左右で強さ ' + power[seat] + '、上下で狙い ' + aim[seat] + ' 度、Enter またはスペースで投げる';

  function drawCurling(zone, seat) {
    const mine = turn === seat;
    zone.append(
      el('strong', mine ? (phase === 'sliding' ? '滑走中' : 'はじけ') : '相手の番'),
      el('small', '投球 ' + throws[seat] + '/' + THROWS_PER_PLAYER + '\n盤上最短 ' + distanceText(best[seat])),
      curlingLane(seat, mine && phase === 'play', mine && phase === 'sliding'),
      renderCurlingShots(seat),
    );
    say(zone, mine && phase === 'play' ? [note, FLICK_HOW_TO].filter(Boolean).join('\n') : note);
  }

  function renderCurlingShots(seat) {
    const result = shotHistory[seat];
    const label = result.map((shot,i) => (i+1) + '投目 ' + (shot==null?'場外':distanceText(shot)));
    return progressStrip(Array.from({length:THROWS_PER_PLAYER},(_,i)=>{
      const value = result[i];
      return i >= result.length ? [String(i+1), i===result.length?'next':'open']
        : value==null ? ['外','off'] : [distanceText(value), value===best[seat]?'best':'used'];
    }), 'tavern-curl-shots', '残り ' + (THROWS_PER_PLAYER-result.length) + '投。' + label.join('、'));
  }

  function curlingLane(seat, canThrow, sliding = false) {
    const lane = el('div', null, 'curl-lane');
    lane.setAttribute('aria-label', '盤面。最後に中央の的に近いコインがある方が勝ち');
    const target = el('span', null, 'curl-target');
    target.setAttribute('aria-hidden', 'true');
    lane.append(target);
    for (const p of phase === 'idle' ? [] : landings) {
      const mark = el('span', null, 'curl-landing curl-world-piece ' + (p.seat === seat ? 'is-mine' : 'is-theirs') +
        (curlDistance(p) === best[p.seat] ? ' is-best' : ''));
      placePiece(mark, p);
      mark.dataset.owner = p.seat;
      mark.dataset.shot = p.id;
      mark.setAttribute('aria-hidden', 'true');
      lane.append(mark);
    }
    const coin = actionButton('コイン', () => {}, !canThrow && !sliding);
    coin.className = 'curl-coin curl-world-piece';
    placePiece(coin, startPoint(seat));
    coin.setAttribute('aria-label', labels(seat));
    if (canThrow) wireCoin(coin, lane, seat);
    if (sliding) {
      coin.classList.add('is-sliding');
      coin.tabIndex = -1;
      coin.setAttribute('aria-hidden', 'true');
    }
    lane.append(coin);
    return lane;
  }

  function wireCoin(coin, lane, seat) {
    const sign = launchSign(seat), origin = startPoint(seat);
    const project = e => {
      const box = lane.getBoundingClientRect();
      const mode = matchMedia('(orientation: portrait)').matches ? 'portrait-' + arena.dataset.layout : 'landscape';
      return curl.project((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height, mode);
    };
    coin.onpointerdown = event => {
      if (phase !== 'play' || turn !== seat || drag || event.button !== 0) return;
      drag = { coin, seat, pointer: event.pointerId, origin, pointerOrigin: project(event), samples: [{ ...origin, t: event.timeStamp }] };
      coin.setPointerCapture(event.pointerId);
    };
    coin.onpointermove = event => {
      if (drag?.coin !== coin || drag.pointer !== event.pointerId) return;
      const pointer = project(event);
      const x = origin.x + pointer.x - drag.pointerOrigin.x;
      const y = origin.y + pointer.y - drag.pointerOrigin.y;
      drag.samples.push({ x, y, t: event.timeStamp });
      drag.samples = drag.samples.filter(s => event.timeStamp - s.t <= FLICK_SAMPLE_MS);
      const forwards = sign > 0 ? x : 100 - x;
      placePiece(coin, { x: sign > 0 ? extent(x, curl.RADIUS, LANE_THROW_LINE) : extent(x, 100 - LANE_THROW_LINE, 100 - curl.RADIUS),
        y: extent(y, curl.RADIUS, curl.HEIGHT - curl.RADIUS) });
      if (forwards >= LANE_THROW_LINE) release(event);
    };
    const release = event => {
      if (drag?.coin !== coin || drag.pointer !== event.pointerId) return;
      const samples = drag.samples.filter(s => event.timeStamp - s.t <= FLICK_SAMPLE_MS);
      drag = null;
      const first = samples[0], last = samples[samples.length - 1];
      const dt = last && first ? last.t - first.t : 0;
      const dx = dt > 0 ? (last.x - first.x) / dt : 0;
      const dy = dt > 0 ? (last.y - first.y) / dt : 0;
      if (dx * sign < FLICK_MIN_SPEED) {
        note = '指で勢いよく的へ。斜めにもはじけます';
        placePiece(coin, origin); setSignal(note);
        zones[seat].querySelector('.say').textContent = note;
        return;
      }
      const line = sign > 0 ? LANE_THROW_LINE : 100 - LANE_THROW_LINE;
      const y = (last.x - line) * sign > 0 ? last.y + (line - last.x) * dy / dx : last.y;
      const { lateral } = curlMetric || boardMetric(lane);
      throwCoin(seat, { x: sign > 0 ? extent(last.x, curl.RADIUS, line) : extent(last.x, line, 100 - curl.RADIUS),
        y: extent(y, curl.RADIUS, curl.HEIGHT - curl.RADIUS) }, Math.atan2(dy * lateral, dx), Math.hypot(dx, dy * lateral) * FLICK_RANGE_MS);
    };
    coin.onpointerup = release;
    coin.onpointercancel = coin.onlostpointercapture = event => {
      if (drag?.coin === coin && drag.pointer === event.pointerId) { drag = null; placePiece(coin, origin); }
    };
    coin.onkeydown = event => {
      if (phase !== 'play' || turn !== seat || !coin.isConnected || drag) return;
      const boost = { ArrowLeft: -KEYBOARD_POWER_STEP, ArrowRight: KEYBOARD_POWER_STEP }[event.key];
      const tilt = { ArrowUp: -5, ArrowDown: 5 }[event.key];
      if (boost || tilt) {
        event.preventDefault();
        if (boost) power[seat] = extent(power[seat] + boost, 0, 100);
        if (tilt) aim[seat] = extent(aim[seat] + tilt, -45, 45);
        coin.setAttribute('aria-label', labels(seat));
        note = '強さ ' + power[seat] + ' ／ 狙い ' + aim[seat] + '°';
        setSignal(note);
        zones[seat].querySelector('.say').textContent = note;
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (event.repeat) return;
        if (!power[seat]) { note = '右矢印で強さを上げて投げる'; setSignal(note); return; }
        const radians = aim[seat] * Math.PI / 180;
        throwCoin(seat, origin, Math.atan2(Math.sin(radians), sign * Math.cos(radians)), power[seat] * KEYBOARD_REACH);
      }
    };
  }

  function throwCoin(seat, from, angle, range) {
    if (phase !== 'play' || turn !== seat) return;
    const launchId = seat + '-' + throws[seat];
    curlMetric ||= boardMetric(zones[seat].querySelector('.curl-lane'));
    const motion = curl.shot(landings, { ...from, id: launchId, seat, angle }, range, curlMetric);
    phase = 'sliding';
    note = '';
    render();
    const nodes = new Map(landings.map(p => [p.id, zones.map(z => z.querySelector('[data-shot="' + p.id + '"]'))]));
    nodes.set(launchId, [zones[seat].querySelector('.curl-coin')]);
    const draw = frame => {
      for (const p of frame) for (const node of nodes.get(p.id)) {
        node.hidden = p.out;
        if (!p.out) placePiece(node, p);
      }
    };
    const complete = () => settleCoin(seat, launchId, motion);
    if (reducedMotion.matches) { draw(motion.result); defer(complete, 0); return; }
    let i = 0;
    const animate = () => {
      draw(motion.frames[i++]);
      if (i < motion.frames.length) defer(animate, motion.frameMs);
      else complete();
    };
    animate();
  }

  function settleCoin(seat, launchId, motion) {
    throws[seat]++;
    landings = motion.result.filter(p => !p.out);
    shotHistory = throws.map((total, owner) => Array.from({ length: total }, (_, i) => {
      const p = landings.find(c => c.id === owner + '-' + i);
      return p ? curlDistance(p) : null;
    }));
    best = shotHistory.map(hist => Math.min(Infinity, ...hist.filter(n => n != null)));
    const stop = landings.find(p => p.id === launchId);
    if (!stop) { note = NAMES[seat] + ' 場外！'; fx.wrong(); }
    else {
      fx.coinRest();
      note = NAMES[seat] + '　中心まで ' + distanceText(curlDistance(stop));
    }
    if (motion.contacts.length) note += ' ／ コインが動いた';
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
    pattern = Array.from({ length: MEMORY_LENGTH }, () => random(SHAPES.length));
    guesses = [[], []];
    cueStep = 0;
    shotHistory = [[], []];
    throws = [0, 0];
    landings = [];
    curlMetric = null;
    best = [Infinity, Infinity];
    power = [0, 0];
    aim = [0, 0];
    note = { curling: '中心に近いほうが勝ち', memory: '合図を覚えよう' }[id];
    if (id === 'memory') {
      phase = 'show';
      cue = -1;
      pattern.forEach((value, i) => {
        defer(() => { cue = value; cueStep = i + 1; fx.cue(); render(); }, MEMORY_FIRST_CUE_MS + i * MEMORY_CUE_STEP_MS);
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
      else { delete arena.dataset.extra; renderMemoryStage(); }
      return !!id;
    },
    update() {
      if (!id) return;
      if (drag) {
        // A held coin cannot carry velocity across a change of coordinate axes.
        const { coin, pointer, seat } = drag;
        drag = null;
        placePiece(coin, startPoint(seat));
        if (coin.hasPointerCapture(pointer)) coin.releasePointerCapture(pointer);
      }
      document.getElementById('hint').textContent = hintText();
      if (phase === 'idle' || (id === 'curling' && phase === 'play')) render();
    },
    handles() { return !!id; },
    reset,
    begin,
    clear() {
      cancel();
      id = null;
      zones.forEach(zone => { zone.hidden = true; });
      delete arena.dataset.extra;
      renderMemoryStage();
    },
  };
})();

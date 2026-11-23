// Extend the original tavern controller without changing the six existing games.
(() => {
  'use strict';
  const previous = window.tavernExtra;
  if (!previous) return;
  const additions = window.tavernNewGames || [];
  const extended = new Map(additions.map(game => [game.id, game]));
  const arena = document.getElementById('arena');
  const start = document.getElementById('start');
  const fx = window.tavernFx;
  const make = (tag, content, className) => {
    const node = document.createElement(tag);
    if (content != null) node.textContent = content;
    if (className) node.className = className;
    return node;
  };
  const zones = [0,1].map(seat => {
    const zone = make('section', null, 'player xgame-seat '+(seat ? 'b' : 'a'));
    zone.setAttribute('aria-label', (seat+1)+'P');
    zone.hidden = true;
    arena.append(zone);
    return zone;
  });
  let game = null, phase = 'idle', round = 0, epoch = 0;
  let cleanupFns = [], timers = new Set(), statusText = '';
  function cancel() {
    epoch++;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const fn of cleanupFns.splice(0)) { try { fn(); } catch {} }
  }
  function setPhase(value) {
    phase = value;
    arena.dataset.phase = phase;
    start.disabled = phase === 'play';
    start.textContent = phase === 'done' ? '再戦' : '開始';
  }
  function say(content) {
    statusText = String(content ?? '');
    document.getElementById('signal').textContent = statusText;
    for (const zone of zones) {
      const status = zone.querySelector('.xgame-status');
      if (status) status.textContent = statusText;
    }
  }
  function clear() {
    const selected = document.activeElement;
    zones.forEach((zone, seat) => {
      const focused = zone.contains(selected) ? selected.getAttribute('aria-label') || selected.textContent : null;
      zone.replaceChildren(
        make('h2', game.name, 'xgame-title'),
        make('p', (seat+1)+'P'+(fx.wins(seat) ? '　'+fx.wins(seat)+'勝' : ''), 'seat'),
        make('p', statusText, 'say xgame-status')
      );
      if (focused) queueMicrotask(() => {
        if (phase !== 'play' || (document.activeElement !== document.body && document.activeElement !== selected)) return;
        [...zone.querySelectorAll('button:not(:disabled)')].find(button =>
          (button.getAttribute('aria-label') || button.textContent) === focused)?.focus({preventScroll:true});
      });
    });
  }
  function drawIdle(reason = '') {
    fx.clearFlashes();
    cancel();
    setPhase('idle');
    statusText = reason || '「開始」を押すと始まります';
    clear();
    for (const zone of zones) {
      zone.append(make('p', game.description, 'xgame-rules'));
      delete zone.dataset.result;
      delete zone.dataset.turn;
    }
    say(statusText);
  }
  function end(winner, message) {
    if (phase !== 'play') return;
    const coop = game.coop === true;
    cancel();
    setPhase('done');
    if (!coop) fx.record(winner);
    fx.result(coop ? null : winner);
    statusText = message || (coop ? 'ふたりの挑戦終了' : winner == null ? '引き分け' : (winner+1)+'P の勝ち');
    clear();
    zones.forEach((zone, seat) => {
      const label = coop ? 'ふたりの結果' : winner == null ? '引き分け' : winner === seat ? '勝ち' : '負け';
      zone.append(make('strong', label, 'xgame-result'));
      zone.dataset.result = coop || winner == null ? '' : winner === seat ? 'win' : 'lose';
      delete zone.dataset.turn;
    });
    say(statusText);
    start.focus({preventScroll:true});
  }
  function begin() {
    if (!game || phase === 'play') return;
    cancel();
    setPhase('play');
    statusText = '';
    clear();
    zones.forEach(zone => delete zone.dataset.result);
    const heldEpoch = epoch;
    const active = () => phase === 'play' && epoch === heldEpoch;
    const ctx = {
      zones, fx, starter: round++ % 2, layout: () => arena.dataset.layout,
      // Lights the half whose turn it is and dims the other; null clears both.
      turn: seat => { if (active()) zones.forEach((zone, s) => { zone.dataset.turn = seat == null ? '' : s === seat ? 'mine' : 'theirs'; }); },
      random: n => Math.floor(Math.random() * n),
      say: content => { if (active()) say(content); },
      text: (seat, content, className) => {
        const node = make('p', content, className || 'xgame-text');
        if (active()) zones[seat].append(node);
        return node;
      },
      button: (seat, label, callback, disabled = false) => {
        const node = make('button', label, 'xgame-action');
        node.type = 'button'; node.disabled = !!disabled;
        node.addEventListener('click', event => {
          if (active() && !node.disabled && node.isConnected) callback(event);
        });
        if (active()) zones[seat].append(node);
        return node;
      },
      clear: () => { if (active()) clear(); },
      later: (fn, milliseconds) => {
        if (!active()) return undefined;
        const timer = setTimeout(() => { timers.delete(timer); if (active()) fn(); }, milliseconds);
        timers.add(timer);
        return timer;
      },
      cleanup: fn => { if (active()) cleanupFns.push(fn); },
      finish: (winner, message) => { if (active()) end(winner, message); }
    };
    game.create(ctx).start();
  }
  function clearGame() {
    fx.clearFlashes();
    cancel();
    game = null; round = 0;
    zones.forEach(zone => { zone.replaceChildren(); zone.hidden = true; });
    if (arena.hasAttribute('data-newgame')) {
      delete arena.dataset.newgame;
      delete arena.dataset.extra;
    }
  }
  window.tavernExtra = {
    entries: [...previous.entries, ...additions],
    select(id) {
      clearGame();
      if (!extended.has(id)) return previous.select(id);
      previous.clear();
      game = extended.get(id);
      arena.dataset.newgame = id;
      arena.dataset.extra = id;
      zones.forEach(zone => { zone.hidden = false; });
      drawIdle();
      return true;
    },
    handles: () => Boolean(game) || previous.handles(),
    begin: () => game ? begin() : previous.begin(),
    reset: reason => game ? drawIdle(reason) : previous.reset(reason),
    clear() { clearGame(); previous.clear(); },
    update() {
      if (!game) { previous.update(); return; }
      const portrait = matchMedia('(orientation: portrait)').matches;
      document.getElementById('hint').textContent = arena.dataset.layout === 'table' && !portrait ? '縦向きがおすすめ' : '';
      if (phase === 'play') drawIdle('向きを変えたので中断しました。「開始」でやり直せます。');
    }
  };
})();

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const chooser = $('chooser'), arena = $('arena'), startButton = $('start');
  const players = [...arena.querySelectorAll('button.player')], portrait = matchMedia('(orientation: portrait)');
  const countDial = document.createElement('div');
  countDial.className = 'count-instrument';
  countDial.setAttribute('aria-hidden', 'true');
  arena.append(countDial);
  const countPreviews = players.map((player, seat) => {
    const hud = document.createElement('span');
    hud.className = 'count-hud';
    const name = document.createElement('b');
    name.textContent = '\u30c6\u30f3\u30ab\u30a6\u30f3\u30c8';
    const objective = document.createElement('span');
    objective.textContent = '10\u79d2\u76ee\u6a19';
    const seatLabel = player.querySelector('.seat');
    seatLabel.after(hud);
    hud.append(seatLabel, name, objective);
    const preview = document.createElement('span');
    preview.className = 'count-preview count-face-' + seat;
    preview.setAttribute('aria-hidden', 'true');
    countDial.append(preview);
    return preview;
  });
  const feedback = players.map(player => {
    const row = document.createElement('span');
    row.className = 'core-game-feedback';
    row.hidden = true;
    player.querySelector('small').after(row);
    return row;
  });
  const categories = { reflex: '反射・スピード', timing: '時間の感覚', memory: '記憶・観察', strategy: '戦略・読み合い', luck: '運試し', party: 'パーティー' };
  const catalog = [
    {id:'count', name:'テンカウント', category:'timing', icon:'⏱️', description:'時計を見ずに、10秒に近いほうが勝ち'},
    {id:'reflex', name:'反射神経バトル', category:'reflex', icon:'⚡', description:'合図が出たら、早押し勝負'}
  ];
  const fx = window.tavernFx;
  const extra=window.tavernExtra; catalog.push(...extra.entries); const games = new Map(catalog.map(entry => [entry.id, entry])), TARGET = 10_000;
  const START_PROMPT = '「開始」を押すと始まります';
  const TIE_WINDOW = 18; // Process near-simultaneous input before comparing its actual millisecond timestamps.
  let game, phase = 'idle', startedAt = 0, waitingTimer, finishTimer, stamps, outcome, message;
  let countPreviewFrame, early;
  const clear = () => {
    clearTimeout(waitingTimer);
    clearTimeout(finishTimer);
    cancelAnimationFrame(countPreviewFrame);
    waitingTimer = finishTimer = countPreviewFrame = undefined;
    delete arena.dataset.countPreview;
  };
  function showCountPreview() {
    arena.dataset.countPreview = 'live';
    const update = () => {
      const elapsed = Math.max(0, performance.now() - startedAt);
      if (elapsed >= 3000) {
        arena.dataset.countPreview = 'fade';
        countPreviewFrame = undefined;
        return;
      }
      const label = (Math.floor(elapsed / 100) / 10).toFixed(1) + ' 秒';
      for (const preview of countPreviews) {
        if (preview.textContent !== label) preview.textContent = label;
      }
      countPreviewFrame = requestAnimationFrame(update);
    };
    update();
  }
  function time(event) {
    const stamp = event.timeStamp;
    return Number.isFinite(stamp) && stamp > 0 && stamp < 1e9 ? stamp : performance.now();
  }
  function render() {
    arena.dataset.phase = phase;
    $('title').textContent = games.get(game).name;
    $('signal').textContent = message;
    const hint = arena.dataset.layout === 'table' && !portrait.matches ? '縦向きがおすすめ' : '';
    $('hint').textContent = hint;
    // Face to face the middle strip is upside down for 1P, so each half repeats the shared message the right way up.
    const say = phase === 'idle'
      ? [games.get(game).description, START_PROMPT, hint].filter(Boolean).join('\n')
      : message;
    startButton.disabled = phase !== 'idle' && phase !== 'done';
    startButton.textContent = phase === 'done' ? '再戦' : '開始';
    players.forEach((b, seat) => {
      const stored = stamps[seat], complete = phase === 'done';
      const active = phase === 'counting' && stored == null || phase === 'waiting' || phase === 'go' && stored == null;
      b.setAttribute('aria-disabled', String(!active));
      b.dataset.result = complete && outcome != null ? (seat === outcome ? 'win' : 'lose') : '';
      b.querySelector('strong').textContent = complete
        ? (outcome == null ? '引き分け' : seat === outcome ? '勝ち' : '負け')
        : phase === 'counting' ? (stored == null ? 'ストップ' : '止めました')
        : phase === 'waiting' ? 'まだ押さない'
        : phase === 'go' ? (stored == null ? '今だ！ 押す' : '押しました') : '準備';
      b.querySelector('.say').textContent = say;
      b.querySelector('.wins').textContent = winsLabel(seat);
      const row = feedback[seat];
      if (game === 'count' && complete && stored != null) {
        const delta = stored - TARGET;
        row.textContent = delta === 0 ? '10秒ぴったり！'
          : '目標との差 ' + (Math.abs(delta) / 1000).toFixed(3) + ' 秒（' + (delta < 0 ? '早い' : '遅い') + '）';
        row.dataset.cue = 'time';
        row.hidden = false;
      } else if (game === 'reflex' && (phase === 'waiting' || phase === 'go')) {
        row.textContent = phase === 'waiting' ? '■　待つ' : stored == null ? '●　押す' : '✓　入力済み';
        row.dataset.cue = phase === 'waiting' ? 'hold' : stored == null ? 'press' : 'set';
        row.hidden = false;
      } else {
        row.hidden = true;
        row.textContent = '';
        delete row.dataset.cue;
      }
      b.querySelector('small').textContent = complete && stored != null
        ? (game === 'count' ? (stored / 1000).toFixed(3) + ' 秒' : stored + ' ms')
        : complete && early[seat] ? 'フライング' : complete && message.includes('フライング') && seat !== outcome ? 'フライング' : '';
    });
  }
  // How many games each player has won since choosing this game, shown beside 1P / 2P.
  const winsLabel = seat => (fx.wins(seat) ? '　' + fx.wins(seat) + '勝' : '');
  function reset() {
    clear(); phase = 'idle'; stamps = [null, null]; early = [false, false]; outcome = null;
    message = game === 'count' ? '10秒だと思ったら押す' : '「今だ！」の合図で押す';
    render();
  }
  function end(winner, label) {
    clear(); phase = 'done'; outcome = winner; message = label ?? (winner == null ? '引き分け' : (winner + 1) + 'P の勝ち');
    fx.record(winner);
    if (label?.includes('フライング')) fx.wrong(); else fx.result(winner);
    render();
  }
  function start() {
    if (phase !== 'idle' && phase !== 'done') return;
    reset();
    if (game === 'count') { phase = 'counting'; startedAt = performance.now(); message = '計測中'; showCountPreview(); render(); return; }
    phase = 'waiting'; message = '合図を待って'; render();
    waitingTimer = setTimeout(() => {
      if (phase !== 'waiting') return;
      startedAt = performance.now(); phase = 'go'; message = '今だ！'; fx.go(); render();
    }, 1600 + Math.floor(Math.random() * 2600));
  }
  function press(seat, event) {
    if (phase === 'waiting') {
      if (early[seat]) return;
      early[seat] = true;
      clearTimeout(waitingTimer);
      if (early.every(Boolean)) {
        end(null, '両者フライング。引き分け');
      } else {
        // Give inputs from the same tap burst a seat-neutral adjudication window.
        finishTimer = setTimeout(() => end(1 - seat, (seat + 1) + 'P フライング'), TIE_WINDOW);
      }
      return;
    }
    if (phase !== 'counting' && phase !== 'go' || stamps[seat] != null) return;
    const timestamp = time(event);
    if (phase === 'go' && timestamp < startedAt) { end(1 - seat, (seat + 1) + 'P フライング'); return; }
    stamps[seat] = Math.round(Math.max(0, timestamp - startedAt));
    fx.tap();
    if (phase === 'counting') {
      if (stamps.includes(null)) { render(); return; }
      const [a,b] = stamps.map(value => Math.abs(TARGET - value));
      end(a === b ? null : Number(b < a));
    } else {
      if (!finishTimer) finishTimer = setTimeout(() => {
        finishTimer = undefined;
        const [a,b] = stamps;
        end(a === b ? null : a == null || b != null && b < a ? 1 : 0);
      }, TIE_WINDOW);
      render();
    }
  }
  // Native click still supports keyboard and assistive technology; mark pointer clicks separately.
  players.forEach((button, seat) => {
    button.addEventListener('pointerdown', event => { if (event.button === 0) press(seat, event); });
    button.addEventListener('click', event => { if (event.detail === 0) press(seat, event); });
  });
  startButton.addEventListener('click', () => extra.handles() ? extra.begin() : start());
  const category = $('category'), list = $('games');
  for (const [id, name] of Object.entries(categories)) {
    if (catalog.some(entry => entry.category === id)) category.add(new Option(name, id));
  }
  function fillCatalog() {
    list.replaceChildren(...catalog.filter(entry => category.value === 'all' || entry.category === category.value).map(entry => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.game = entry.id;
      const icon = document.createElement('span'); icon.textContent = entry.icon; icon.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = entry.name;
      const description = document.createElement('small'); description.textContent = entry.description;
      button.append(icon, name, description); return button;
    }));
  }
  category.addEventListener('change', fillCatalog); fillCatalog();
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-game]');
    if (!button) return;
    game = button.dataset.game;
    fx.resetWins();
    arena.dataset.activeGame = game;
    arena.dataset.layout = chooser.querySelector('input:checked').value;
    chooser.hidden = true; arena.hidden = false; if(extra.select(game)){$('title').textContent=games.get(game).name;extra.update();}else reset(); startButton.focus();
  });
  $('exit').addEventListener('click', () => {
    clear(); extra.clear(); phase = 'idle'; finishTimer = undefined;
    const focus = chooser.querySelector('[data-game="' + game + '"]'); arena.hidden = true; delete arena.dataset.activeGame; chooser.hidden = false; focus.focus();
  });
  $('sound').addEventListener('click', event => {
    fx.soundOn = !fx.soundOn;
    event.currentTarget.setAttribute('aria-pressed', String(fx.soundOn));
    if (fx.soundOn) fx.tap();
  });
  window.addEventListener('keydown', event => {
    if (!arena.hidden && event.key === 'Escape' && !event.repeat) { event.preventDefault(); $('exit').click(); return; }
    if (arena.hidden || extra.handles() || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const seat = ['f', 'j'].indexOf(event.key.toLowerCase());
    if (seat !== -1) { event.preventDefault(); press(seat, event); }
  });
  portrait.addEventListener('change', () => { if (!arena.hidden) {if(extra.handles())extra.update();else render();} });
  document.addEventListener('visibilitychange', () => {
    if(!arena.hidden&&extra.handles()){if(document.hidden&&!['idle','done'].includes(arena.dataset.phase)) extra.reset('画面を離れたので中断');return;} if (!document.hidden || arena.hidden || phase === 'idle' || phase === 'done') return;
    reset(); message = '画面を離れたので中断'; render();
  });
  window.addEventListener('pagehide', () => { if (!arena.hidden) {if(extra.handles())extra.reset();else reset();} });
})();

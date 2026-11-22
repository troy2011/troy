// Tavern games, set B: turn-based board and dice games.
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

  function ledger(ctx, seat, entries) {
    const strip = make('div', null, 'xb-ledger');
    for (const [label, value, tone] of entries) {
      const item = make('div', null, 'xb-ledger-item');
      if(tone) item.dataset.tone = tone;
      item.append(make('span', label, 'xb-ledger-label'), make('strong', String(value), 'xb-ledger-value'));
      strip.append(item);
    }
    ctx.zones[seat].append(strip);
  }

  // One grid of cells in each half. `cells[i]` = { label, mark (0 / 1 / null), disabled, a11y }.
  function board(ctx, cells, cols, activeSeat, activate) {
    (cols === 4 ? [0] : [0,1]).forEach(seat => {
      const grid = make('div', null, 'xgame-grid xgame-board');
      grid.style.setProperty('--cols', cols);
      grid.dataset.tavernBoard = cols === 4 ? 'dig' : 'fifteen';
      cells.forEach((cell, i) => {
        const button = make('button', cell.label, 'xgame-action');
        button.type = 'button';
        button.disabled = (cols !== 4 && seat !== activeSeat) || !!cell.disabled;
        if (cell.mark === 0 || cell.mark === 1) button.dataset.mark = cell.mark === seat ? 'mine' : 'theirs';
        if (cell.tone) button.dataset.tone = cell.tone; if (cols === 4 && cell.tone === "sand") button.dataset.digit = cell.label;
        if (cell.a11y) button.setAttribute('aria-label', cell.a11y);
        if (cell.desc) button.setAttribute('aria-description', cell.desc);
        button.addEventListener('click', () => { if (!button.disabled) activate(i); });
        grid.append(button);
      });
      ctx.zones[seat].append(grid);
    });
  }
  meta('take-fifteen', '15の取り合い', 'strategy', '🧮', '1〜9を交互に1枚ずつ取る。自分の数字のどれか3枚で15を作れば勝ち。', ctx => {
    let turn = ctx.starter;
    const picked = [[], []];
    const nums = Array.from({ length: 9 }, (_, i) => i + 1);
    const winningTriple = a => {
      for(let i=0;i<a.length-2;i++) for(let j=i+1;j<a.length-1;j++){
        const k=a.indexOf(15-a[i]-a[j],j+1);
        if(k>=0)return [a[i],a[j],a[k]].sort((x,y)=>x-y);
      }
      return null;
    };
    const render = () => {
      ctx.clear();
      ctx.turn(turn);
      ctx.say(seatName(turn) + 'の番　自分の数字3枚で15を作る');
      both(s => ledger(ctx, s, [
        ['あなたの札', picked[s].join('・') || '—', 'secured'],
        ['相手の札', picked[1-s].join('・') || '—', 'opponent']
      ]));
      board(ctx, nums.map(n => ({
        label: String(n),
        desc: picked[0].includes(n) ? '1Pが取得済み' : picked[1].includes(n) ? '2Pが取得済み' : '取れる札',
        disabled: picked.some(a => a.includes(n)),
        mark: picked[0].includes(n) ? 0 : picked[1].includes(n) ? 1 : null,
      })), 3, turn, pick);
    };
    function pick(i) {
      const n = nums[i];
      if (picked.some(a => a.includes(n))) return;
      picked[turn].push(n);
      ctx.fx.tap();
      const triple = winningTriple(picked[turn]);
      if (triple) { win(ctx, turn, triple.join(' ＋ ') + ' ＝ 15'); return; }
      if (picked[0].length + picked[1].length === 9) { ctx.finish(null, '9枚を取り切って引き分け。'); return; }
      turn = 1 - turn;
      render();
    }
    return { start: render };
  });

  // ---- 海賊ダイス: push your luck. Roll to build up gold; a skull loses this turn's gold. ----
  const DICE_GOAL = 30;
  const DICE_FACES = ['☠', '⚁', '⚂', '⚃', '⚄', '⚅'];
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
        ledger(ctx,s,[
          ['あなたの確保', bank[s] + ' / ' + DICE_GOAL, 'secured'],
          ['相手の確保', bank[1 - s] + ' / ' + DICE_GOAL, 'opponent'],
          [s===turn?'未確保':'相手の未確保', pot + ' 枚', 'risk']
        ]);
        const die=ctx.text(s, rolling || face == null ? '🎲' : DICE_FACES[face-1], 'xb-dice-face xgame-big' + (rolling ? ' is-rolling' : face === 1 ? ' is-bust' : ''));
        die.dataset.face = rolling || face == null ? 'idle' : String(face);
        die.setAttribute('aria-label', rolling?'振っています':face==null?'ダイス':face===1?'ドクロ':face+'の目');
      });
      both(seat => {
        const controls = make('div', null, 'xb-dice-controls');
        controls.append(ctx.button(seat, '振る', roll, rolling || seat !== turn),
          ctx.button(seat, '貯めて交代', keep, rolling || seat !== turn || pot === 0));
        ctx.zones[seat].append(controls);
      });
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
        render(seatName(turn) + '：' + face + 'の目。未確保 ＋' + face + '枚（計' + pot + '枚）');
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
      const left = DIG_TREASURES - [...treasure].filter(i => dug[i] !== null).length;
      both(s => ledger(ctx, s, [
        ['あなたのお宝', found[s], 'secured'],
        ['相手のお宝', found[1-s], 'opponent'],
        ['未発掘のお宝', left, 'risk']
      ]));
      board(ctx, dug.map((v, i) => ({
        label: label(i) || '▒',
        mark: v,
        tone: dug[i] === null ? '' : treasure.has(i) ? 'gold' : skull.has(i) ? 'skull' : 'sand',
        disabled: v !== null,
        a11y: '行 ' + (1 + Math.floor(i / DIG_SIZE)) + ' 列 ' + (1 + (i % DIG_SIZE)) + (v === null ? ' 未発掘' : treasure.has(i) ? ' お宝' : skull.has(i) ? ' ドクロ' : ' 周囲のお宝 ' + near(i) + 'つ'),
      })), DIG_SIZE, turn, dig);
    };
    function dig(i) {
      if (dug[i] !== null) return;
      dug[i] = turn;
      if (treasure.has(i)) {
        found[turn]++;
        ctx.fx.correct();
        if ([...treasure].every(t => dug[t] !== null)) {
          ctx.finish(found[0] === found[1] ? null : found[0] > found[1] ? 0 : 1, '発掘完了：お宝 1P ' + found[0] + ' 対 2P ' + found[1]);
          return;
        }
        render(seatName(turn) + ' がお宝を発見！ もう一度掘れる');
        return;
      }
      if (skull.has(i)) {
        const lost = found[turn] > 0;
        found[turn] = Math.max(0, found[turn] - 1);
        ctx.fx.wrong();
        turn = 1 - turn;
        render('☠ ドクロ！ ' + (lost ? 'お宝を1つ没収' : '没収なし（0個）') + '　' + seatName(turn) + 'の番');
        return;
      }
      ctx.fx.tap();
      turn = 1 - turn;
      render('手がかり：周囲8マスのお宝 ' + near(i) + 'つ　' + seatName(turn) + 'の番');
    }
    return { start: () => render() };
  });

})();


(() => {
  'use strict';
  const registry = window.tavernNewGames ??= [];
  const both = fn => [0, 1].forEach(fn);
  const make = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const add = (id, name, category, icon, description, start) => {
    registry.push({ id, name, category, icon, description, create: ctx => ({ start: () => start(ctx) }) });
  };
  // Everyone sees the same warnings at the same time. Each playable lane is one direct tap away.
  const WAVE_COURSES = [[1,0,2,1,0,2,1,2,0,3,4,5],[1,2,0,1,2,0,1,0,2,5,4,3],[1,0,1,2,0,1,2,1,0,4,3,5]];
  const HAZARDS = [[0],[1],[2],[0,1],[0,2],[1,2]];
  const LANE_NAMES = ['左','中央','右'];
  let lastCourse = -1;
  add('wave-dodge','荒波よけ','reflex','🌊','波がくる列を見て、安全な列へ移動。先にぶつかると負け。12波を同時に越えたら引き分け。',ctx=>{
    lastCourse = (lastCourse + 1 + ctx.random(WAVE_COURSES.length-1)) % WAVE_COURSES.length;
    const course = WAVE_COURSES[lastCourse], position = [1,1], cells = [[],[]];
    let wave = 0, blocked, closingAt = 0, settled = false;
    function paint(seat) {
      for (let i=0;i<3;i++) {
        const ship = position[seat] === i, danger = blocked.includes(i);
        cells[seat][i].dataset.ship = String(ship);
        cells[seat][i].dataset.danger = String(danger);
        cells[seat][i].setAttribute('aria-pressed',String(ship));
        cells[seat][i].setAttribute('aria-label',LANE_NAMES[i] + (danger?'、波が来る':'、安全') + (ship?'、船の位置':''));
        cells[seat][i].firstChild.textContent = danger ? '🌊' : '·';
        cells[seat][i].lastChild.textContent = ship ? '⛵' : ' ';
      }
    }
    function next() {
      blocked = HAZARDS[course[wave]];
      closingAt = performance.now() + Math.max(1000, 1500 - wave * 45);
      both(paint);
      ctx.say('第 '+(wave+1)+' / '+course.length+' 波　安全な列をタップ');
      // Resolve both seats from a single deadline, never from the order their boards get painted.
      ctx.later(hit, Math.ceil(Math.max(0, closingAt - performance.now())));
    }
    function hit() {
      if (settled) return;
      const lost = position.map(lane=>blocked.includes(lane));
      if (lost.some(Boolean) || wave+1===course.length) {
        settled = true;
        const winner = lost[0]===lost[1] ? null : (lost[0]?1:0);
        ctx.finish(winner, winner!==null ? (winner+1)+'P が勝利！ 第 '+(wave+1)+' 波' :
          lost[0] ? 'ふたりとも第 '+(wave+1)+' 波で座礁。引き分け！' : 'ふたりとも12波を突破！ 引き分け');
        return;
      }
      wave++;
      next();
    }
    ctx.turn(null);
    both(seat=>{
      const lane = make('div','','xgame-grid is-three sea-lanes');
      LANE_NAMES.forEach((name,i)=>{
        const button=ctx.button(seat,'',()=>{
          if(settled || performance.now()>=closingAt || position[seat]===i)return;
          position[seat]=i;paint(seat);ctx.fx.tap();
        });
        button.append(make('span','','sea-wave'),make('span','','sea-ship'));
        cells[seat][i]=button;lane.append(button);
      });
      ctx.zones[seat].append(lane);
    });
    next();
  });

  // A1 → B1 → C1 → C2 → B2 → A2 → A3 → B3 → C3. Endpoints lie just outside.
  const ROUTE = [[0,-1],[0,0],[1,0],[2,0],[2,1],[1,1],[0,1],[0,2],[1,2],[2,2],[2,3]];
  const variants = [];
  for (let mirror=0;mirror<2;mirror++) for(let turns=0;turns<4;turns++){
    variants.push(ROUTE.map(([row,col])=>{
      if(mirror) col=2-col;
      for(let i=0;i<turns;i++) [row,col]=[col,2-row];
      return [row,col];
    }));
  }
  const DR=[-1,0,1,0], DC=[0,1,0,-1], LABELS=['上','右','下','左'];
  const dir = (a,b) => DR.findIndex((row,i)=>row===b[0]-a[0]&&DC[i]===b[1]-a[1]);
  const idx = point => point[0]*3+point[1];
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = tag => document.createElementNS(svgNS,tag);
  const ANGLES = [[25,0],[50,25],[25,50],[0,25]];
  function chartPiece(node, ends, startDir, finishDir) {
    const shape = svg('svg');
    shape.setAttribute('viewBox','0 0 50 50');
    shape.setAttribute('aria-hidden','true');
    const trail = svg('polyline');
    trail.setAttribute('points', ANGLES[ends[0]].join(',')+' 25,25 '+ANGLES[ends[1]].join(','));
    shape.append(trail);
    for(const [direction,key] of [[startDir,'port'],[finishDir,'island']]){
      if(direction<0)continue;
      const pin = svg('circle'), [x,y]=ANGLES[direction];
      pin.setAttribute('cx',String(Math.min(43,Math.max(7,x))));
      pin.setAttribute('cy',String(Math.min(43,Math.max(7,y))));
      pin.setAttribute('r','5');
      pin.setAttribute('class',key);
      shape.append(pin);
    }
    node.replaceChildren(shape);
  }
  const TIE_MS = 100;
  let lastChart = -1;
  add('sea-chart','海図パズル','strategy','🗺','マスを押して90°ずつ回し、青い港から金色の島まで9マス全部をひとつの道でつなごう。',ctx=>{
    const available = variants.map((_,i)=>i).filter(i=>lastChart<0 || i!==lastChart && i!==(lastChart^2));
    const choice = available[ctx.random(available.length)];
    const route = variants[choice];
    lastChart = choice;
    const inside = route.slice(1,-1), inlet = idx(inside[0]), outlet = idx(inside[8]);
    const from = dir(inside[0],route[0]), to = dir(inside[8],route[10]);
    const solvedEnds = [];
    inside.forEach((point,i)=>{solvedEnds[idx(point)]=[dir(point,route[i]),dir(point,route[i+2])];});
    // Both sides see the same shuffled tile orientations, never the solved board.
    const offsets=solvedEnds.map(ends=>{
      const straight=(ends[0]+2)%4===ends[1];
      return straight?ctx.random(2):ctx.random(4);
    });
    if(offsets.filter(o=>o!==0).length<3){
      // These first three rotations change each tile's ports unless it was already scrambled.
      for(let i=0;i<3;i++) if(!offsets[i]) offsets[i]=1;
    }
    const rotation=[offsets.slice(),offsets.slice()], pieces=[[],[]], finishes=[null,null];
    const endsFor=(seat,i)=>solvedEnds[i].map(d=>(d+rotation[seat][i])%4);
    function connects(seat) {
      let i=inlet, direction=from;
      const visited=new Set();
      while(!visited.has(i)){
        visited.add(i);
        const ends=endsFor(seat,i);
        if(!ends.includes(direction))return false;
        const next=ends.find(d=>d!==direction);
        const r=Math.floor(i/3)+DR[next], c=i%3+DC[next];
        if(r<0||r>=3||c<0||c>=3) return i===outlet && next===to && visited.size===9;
        i=r*3+c;direction=(next+2)%4;
      }
      return false;
    }
    const draw = (seat,i)=>{
      const node=pieces[seat][i], ends=endsFor(seat,i);
      node.dataset.ports=ends.join(',');
      node.setAttribute('aria-label', 'ABC'[Math.floor(i/3)]+(i%3+1)+' '+ends.map(d=>LABELS[d]).join('・')+
        (i===inlet?' 港 '+LABELS[from]:i===outlet?' 島 '+LABELS[to]:''));
      chartPiece(node,ends,i===inlet?from:-1,i===outlet?to:-1);
    };
    function finish() {
      const [a,b]=finishes;
      const winner=a!==null&&b!==null&&Math.abs(a-b)<=TIE_MS ? null : b===null||a!==null&&a<b ? 0:1;
      ctx.finish(winner,winner===null?'ほぼ同時に完成！ 引き分け':(winner+1)+'P が海図を完成！');
    }
    function rotate(seat,i,event) {
      if(finishes[seat]!==null)return;
      rotation[seat][i]=(rotation[seat][i]+1)%4;
      draw(seat,i);
      if(!connects(seat)){ctx.fx.tap();return;}
      const now=performance.now();
      finishes[seat] = event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now;
      pieces[seat].forEach(button=>{button.disabled=true;});
      if(finishes[1-seat]!==null){finish();return;}
      ctx.say('海図が完成！');
      ctx.later(finish,TIE_MS+16);
    }
    ctx.turn(null);
    both(seat=>{
      const board=make('div','','xgame-grid is-three sea-chart');
      board.dataset.inlet=inlet+':'+from;board.dataset.outlet=outlet+':'+to;
      for(let i=0;i<9;i++){
        const node=ctx.button(seat,'',event=>rotate(seat,i,event));
        node.dataset.tile=String(i);pieces[seat][i]=node;board.append(node);draw(seat,i);
      }
      ctx.zones[seat].append(board);
      ctx.text(seat,'青：港　金：島','xgame-text sea-legend');
    });
    ctx.say('9マスをひとつの航路に');
  });
})();

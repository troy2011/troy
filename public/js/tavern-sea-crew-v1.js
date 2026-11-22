(() => {
  'use strict';
  const registry = window.tavernNewGames ??= [];
  const glyphs = ['⚓','★','◈','▲','☾','✚'];
  let oldCipher = '';
  const node = (tag, cls, value) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (value != null) e.textContent = value;
    return e;
  };
  const take = (arr, random) => arr.splice(random(arr.length), 1)[0];

  registry.push({
    id:'pirate-cipher', name:'海賊暗号', category:'memory', icon:'⚿',
    description:'同じ暗号表で4つの記号を読み解け。最初に解読した方の勝ち。',
    create(ctx) {
      return {start() {
        ctx.clear(); ctx.layout(); ctx.turn(null);
        ctx.say('暗号表を見て、左から4桁を入力。入力は自分の席にだけ表示されます。');
        const digits = Array.from({length:9}, (_,i)=>i+1);
        const key = glyphs.map(()=>take(digits,ctx.random));
        const options = glyphs.map((_,i)=>i);
        const sequence = Array.from({length:4},()=>take(options,ctx.random));
        if (sequence.join()===oldCipher) sequence.push(sequence.shift());
        oldCipher = sequence.join();
        const answer = sequence.map(i=>key[i]).join('');
        const inputs = [[],[]], reads = [], entered = [null,null];
        let adjudicating=false, done=false;
        const finish = () => {
          if(done) return;
          done=true;
          if(entered[0]!==null && entered[1]!==null && Math.abs(entered[0]-entered[1])<=60) {
            ctx.finish(null,'ほぼ同時に解読！ 引き分け。'); return;
          }
          const winner = entered[0]!==null && (entered[1]===null || entered[0]<entered[1]) ? 0 : 1;
          ctx.finish(winner,'海賊暗号を解読！');
        };
        for(let seat=0;seat<2;seat++) {
          const board=node('section','sea-cipher');
          board.dataset.seaCipher=String(seat);
          const code=node('div','sea-cipher-code',sequence.map(i=>glyphs[i]).join(' '));
          code.setAttribute('aria-label','暗号 '+sequence.map(i=>glyphs[i]).join(' '));
          const table=node('div','sea-cipher-key'); table.setAttribute('aria-label','暗号表');
          glyphs.forEach((g,i)=>{const pair=node('span','',g+' '+key[i]);table.append(pair);});
          const read=node('output','sea-cipher-read','○ ○ ○ ○');
          read.setAttribute('aria-live','polite');
          const keys=node('div','sea-cipher-keys');
          board.append(code,table,read,keys);ctx.zones[seat].append(board);reads[seat]=read;
          const refresh = () => {
            read.textContent = Array.from({length:4},(_,j)=>inputs[seat][j]??'○').join(' ');
            read.removeAttribute('data-error');
          };
          const add=(value) => {
            if(done || entered[seat]!==null) return;
            if(value===0){inputs[seat].pop();refresh();return;}
            inputs[seat].push(value);refresh();
            if(inputs[seat].length!==4) return;
            if(inputs[seat].join('')!==answer) {
              inputs[seat]=[];
              read.textContent='不正解・もう一度';
              read.dataset.error='true';
              return;
            }
            entered[seat]=performance.now();
            read.textContent='解読成功';
            if(!adjudicating) {
              adjudicating=true;
              ctx.later(finish,64);
            }
          };
          for(let i=1;i<=9;i++){
            const b=ctx.button(seat,String(i),()=>add(i));b.dataset.cipherDigit=String(i);keys.append(b);
          }
          const b=ctx.button(seat,'1字消す',()=>add(0));b.classList.add('sea-cipher-erase');keys.append(b);
        }
      }};
    }
  });

  const lanes = [
    [0,0,1,2,2,1,0,-1,-1,0,1,2,2,1,0,0],
    [0,0,-1,-2,-2,-1,0,1,1,0,-1,-2,-2,-1,0,0],
    [0,0,1,1,0,-1,-2,-2,-1,0,1,1,2,1,0,0]
  ];
  let lastLane=-1;
  const SVG='http://www.w3.org/2000/svg';
  function svg(tag,attrs) {
    const el=document.createElementNS(SVG,tag);
    for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);
    return el;
  }
  registry.push({
    id:'harbor-dock', name:'ふたりで入港', category:'party', icon:'⚓', coop:true,
    description:'舵と速さを分担。ブイの間を抜け、最後はゆっくり接岸しよう。',
    create(ctx) {
      return {start() {
        ctx.clear();ctx.layout();ctx.turn(null);
        const lane=(lastLane+1+ctx.random(lanes.length-1))%lanes.length;lastLane=lane;
        const course=lanes[lane];
        const pilot=ctx.starter===1?1:0, sails=1-pilot;
        let x=0,z=0,heading=0,throttle=0,arrived=false, elapsed=0, started=false, last=0;
        const limit=32;
        const board=[],out=[],courseViews=[],vessels=[],control=[[],[]];
        const refresh = () => {
          for(let s=0;s<2;s++){
            out[s].textContent=started
              ? '残り '+Math.max(0,Math.ceil(limit-elapsed))+'秒　'+(z>=12?'接岸は低速で':'ブイの間を通過')
              : '速さを選ぶと出航　接岸は低速';
            vessels[s].setAttribute('transform','translate('+(100+x*23)+','+(126-z*7)+') rotate('+(heading*20)+')');
          }
          for(const btn of control[pilot])btn.setAttribute('aria-pressed',String(+btn.dataset.value===heading));
          for(const btn of control[sails])btn.setAttribute('aria-pressed',String(+btn.dataset.value===throttle));
        };
        const finish=(msg)=>{
          if(arrived)return;
          arrived=true;
          ctx.finish(null,msg);
        };
        const tick=()=>{
          if(arrived)return;
          const now=performance.now();
          const dt=started?Math.min((now-last)/1000,.20):0;last=now;
          if(started){
            elapsed+=dt;
            const move=throttle===2?1.9:throttle===1?.79:0;
            // As the bow travels forward, the selected wheel angle changes its lateral position.
            x+=heading*dt*move*1.13;
            z+=dt*move;
            const i=Math.min(course.length-2,Math.floor(z)), f=Math.min(z-i,1);
            const center=course[i]+(course[i+1]-course[i])*f;
            if(Math.abs(x-center)>.90){finish('ブイの外に出ました。ふたりでもう一度！');return;}
            if(z>=course.length-1){
              if(throttle===1 && Math.abs(x)<.64)finish('ふたりで入港成功！');
              else finish('接岸できませんでした。桟橋の中央に低速で入りましょう。');
              return;
            }
            if(elapsed>=limit){finish('時間切れ。ふたりでタイミングを合わせて再挑戦！');return;}
          }
          refresh();ctx.later(tick,80);
        };
        ctx.say('舵担当はブイの間へ。速さ担当は途中で調整、桟橋は低速。左右は地図基準です。');
        for(let s=0;s<2;s++){
          const panel=node('section','sea-harbor'); panel.dataset.seaHarbor=s===pilot?'helm':'speed';
          const title=node('h3','sea-harbor-title',s===pilot?'舵担当':'速さ担当');
          const diagram=svg('svg',{viewBox:'0 0 200 145',class:'sea-harbor-map','aria-label':'船とブイの見取り図',role:'img'});
          const points=course.map((c,i)=>(100+c*23)+','+(126-i*7)).join(' ');
          diagram.append(svg('polyline',{points,fill:'none',stroke:'#162731','stroke-width':54,'stroke-linejoin':'round'}));
          diagram.append(svg('polyline',{points,fill:'none',stroke:'#367082','stroke-width':39,'stroke-linejoin':'round'}));
          for(let j=0;j<course.length;j+=2){
            const y=126-j*7, cx=100+course[j]*23;
            diagram.append(svg('circle',{cx:cx-21,cy:y,r:2.75,fill:'#ff906a'}),svg('circle',{cx:cx+21,cy:y,r:2.75,fill:'#ffdb89'}));
          }
          diagram.append(svg('path',{d:'M80 8H120V23H110V12H90V23H80Z',fill:'#e8c58e'}));
          const ship=svg('path',{d:'M0 -6L5 4L0 3L-5 4Z',fill:'#fff1af',stroke:'#332519','stroke-width':1.05});
          diagram.append(ship);vessels[s]=ship;
          const info=node('p','sea-harbor-info');out[s]=info;
          const buttons=node('div','sea-harbor-buttons');
          panel.append(title,diagram,info,buttons);ctx.zones[s].append(panel);board[s]=panel;
          const configs=s===pilot?[['左',-1],['正面',0],['右',1]]:[['停止',0],['低速',1],['全速',2]];
          for(const [label,value] of configs){
            const b=ctx.button(s,label,()=>{
              if(arrived)return;
              if(s===pilot)heading=value;
              else {
                throttle=value;
                if(!started&&value>0){started=true;last=performance.now();}
              }
              refresh();
            });
            b.dataset.value=String(value);control[s].push(b);buttons.append(b);
          }
        }
        refresh();ctx.later(tick,80);
      }};
    }
  });
})();

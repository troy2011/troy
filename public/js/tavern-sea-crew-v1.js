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
        const inputs = [[],[]], entered = [null,null];
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
          glyphs.forEach((g,i)=>{
            const pair=node('span','sea-cipher-pair');
            pair.append(node('i','sea-cipher-symbol',g), document.createTextNode(' '), node('b','sea-cipher-value',key[i]));
            table.append(pair);
          });
          const frame=node('div','sea-cipher-entry');
          const read=node('output','sea-cipher-read');
          read.setAttribute('aria-live','off');
          const status=node('span','sea-cipher-status');
          status.setAttribute('role','status');
          status.setAttribute('aria-live','polite');
          frame.append(read,status);
          const keys=node('div','sea-cipher-keys');
          board.append(code,table,frame,keys);ctx.zones[seat].append(board);
          const refresh = () => {
            const values=inputs[seat];
            // Show only entered positions, never the actual private digits on a shared screen.
            read.replaceChildren(...Array.from({length:4},(_,j)=>
              node('span',j===values.length?'sea-cipher-next':'',values[j]===undefined?'○':'●')));
            status.textContent=values.length+' / 4';
            frame.removeAttribute('data-error');
          };
          refresh();
          const add=(value) => {
            if(done || entered[seat]!==null) return;
            if(value===0){inputs[seat].pop();refresh();return;}
            inputs[seat].push(value);refresh();
            if(inputs[seat].length!==4) return;
            if(inputs[seat].join('')!==answer) {
              inputs[seat]=[];
              refresh();
              status.textContent='不正解・再入力';
              frame.dataset.error='true';
              return;
            }
            entered[seat]=performance.now();
            status.textContent='解読成功';
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

})();

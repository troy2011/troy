(() => {
  'use strict';
  const registry = window.tavernNewGames ??= [];
  let last = '';
  function node(tag, cls, text) {
    const el=document.createElement(tag);el.className=cls;if(text!=null)el.textContent=text;return el;
  }
  // Corner order is clockwise (NW, NE, SE, SW). Each torn panel lacks one corner.
  const cellToCorner=[0,1,3,2];
  const corners=['左上','右上','右下','左下'];
  function piece(gap) {
    const piece=node('span','sea-sail-piece');
    piece.setAttribute('aria-hidden','true');
    for(const corner of cellToCorner)piece.append(node('span',corner===gap?'sea-sail-gap':'sea-sail-fabric'));
    return piece;
  }
  registry.push({
    id:'sail-patch', name:'帆のつぎはぎ', category:'memory', icon:'▧',
    description:'帆の見本を見て、4枚の布を回して同じ形にしよう。',
    create(ctx) {
      return {start() {
        ctx.clear();ctx.layout();ctx.turn(null);
        ctx.say('布を押すと時計回りに90°回ります。先に見本と同じ帆を作ろう。');
        const target=Array.from({length:4},()=>ctx.random(4));
        if(target.join()===last)target[ctx.random(4)]=(target[0]+1)%4;
        if(target.join()===last)target[0]=(target[0]+1)%4;
        last=target.join();
        const start=target.map(a=>(a+1+ctx.random(3))%4);
        const stamps=[null,null], started=performance.now();
        const seconds=value=>((value-started)/1000).toFixed(2)+'秒';
        const timeOf=event=>{
          const now=performance.now(), stamp=event?.timeStamp;
          return stamp>=started&&stamp<=now?stamp:now;
        };
        let done=false,pending=false;
        const resolve=()=>{
          if(done)return;
          done=true;
          if(stamps.every(x=>x!==null)&&Math.abs(stamps[0]-stamps[1])<=100) {
            ctx.finish(null,'ほぼ同時に帆を完成！ 引き分け。 1P '+seconds(stamps[0])+' ／ 2P '+seconds(stamps[1])+'。');return;
          }
          const winner=stamps[0]!==null&&(stamps[1]===null||stamps[0]<stamps[1])?0:1;
          ctx.finish(winner,'帆の修理完了！ '+(winner+1)+'P '+seconds(stamps[winner])+'、布4枚が一致。');
        };
        for(let seat=0;seat<2;seat++){
          const progress=[...start],board=node('section','sea-sail');
          board.dataset.sailSeat=String(seat);
          const blueprint=node('div','sea-sail-blueprint'), edit=node('div','sea-sail-edit');
          const sample=node('div','sea-sail-example'), title=node('p','sea-sail-label','見本');
          sample.setAttribute('role','img');
          sample.setAttribute('aria-label','見本の欠け：'+target.map(i=>corners[i]).join('、'));
          sample.dataset.sailSample=target.join(',');
          target.forEach(i=>sample.append(piece(i)));
          blueprint.append(title,sample);
          const status=node('p','sea-sail-status');status.setAttribute('role','status');
          const redraw=(button,i)=>{
            const ok=progress[i]===target[i];
            const mark=node('span','sea-sail-tile-mark',ok?'✓':'↻');
            mark.setAttribute('aria-hidden','true');
            button.replaceChildren(piece(progress[i]),mark);
            button.setAttribute('aria-label',corners[[0,1,3,2][i]]+'の布・欠けは'+corners[progress[i]]+'・'+(ok?'見本と一致・':'')+'回転');
            button.dataset.sailCorner=String(progress[i]);
            button.dataset.match=String(progress[i]===target[i]);
          };
          const dots=node('span','sea-sail-stitches');
          dots.setAttribute('aria-hidden','true');
          const stitch=target.map(()=>node('span','sea-sail-stitch','○'));
          dots.append(...stitch);
          const tell=()=>{
            const matched=progress.filter((v,i)=>v===target[i]).length;
            status.textContent=String(matched)+' / 4 一致';
            stitch.forEach((mark,i)=>{
              const ok=progress[i]===target[i];
              mark.textContent=ok?'✓':'○';
              mark.dataset.match=String(ok);
            });
          };
          for(let i=0;i<4;i++){
            const b=ctx.button(seat,'布を回す',event=>{
              if(done||stamps[seat]!==null)return;
              progress[i]=(progress[i]+1)%4;redraw(b,i);tell();
              if(!progress.every((v,j)=>v===target[j]))return;
              stamps[seat]=timeOf(event);status.textContent='4 / 4 一致・完成！';
              if(!pending){pending=true;ctx.later(resolve,104);}
            });
            b.dataset.sailTile=String(i);edit.append(b);redraw(b,i);
          }
          const panel=node('div','sea-sail-work'), workTitle=node('p','sea-sail-label','回す布');
          panel.append(workTitle,edit);board.append(blueprint,panel,status,dots);
          ctx.zones[seat].append(board);tell();
        }
      }};
    }
  });
})();

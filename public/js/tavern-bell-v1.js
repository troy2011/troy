
(() => {
  'use strict';
  const registry = window.tavernNewGames ??= [];
  const windowMs = 220, lead = 960;
  const patterns = [
    [0,720,1440,2160,2960,3680,4400,5200,5920,6640],
    [0,750,1500,2300,2980,3660,4460,5210,5960,6760],
    [0,780,1460,2240,3020,3670,4450,5230,5950,6670]
  ];
  let previous = -1;
  const make=(tag,className)=>{const e=document.createElement(tag);e.className=className;return e;};
  registry.push({
    id:'bell-rhythm',name:'船鐘リズム',category:'timing',icon:'🔔',
    description:'光の印が中央の線に重なるときにタップ。10回の正確さで勝負。押し逃した拍は0点。',
    create(ctx){return {start(){
      const choice=(previous+1+ctx.random(patterns.length-1))%patterns.length;
      previous=choice;
      const beats=patterns[choice], pads=[], tracks=[], marks=[], reads=[], previews=[], notes=[Array(beats.length).fill(null),Array(beats.length).fill(null)];
      const origin=performance.now()+lead, cutoff=origin+beats.at(-1)+windowMs;
      const landed=[0,0], missed=[0,0], counters=[], status=[];
      const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
      let frame=0, done=false, lastCue=-1;
      const total=seat=>notes[seat].reduce((sum,value)=>sum+(value??0),0);
      function hit(seat,event){
        if(done)return;
        const now=performance.now(), t=(event.timeStamp>0&&event.timeStamp<=now?event.timeStamp:now)-origin;
        let index=-1, error=Infinity;
        for(let b=0;b<beats.length;b++){
          const diff=Math.abs(t-beats[b]);
          if(diff<=windowMs&&diff<error){index=b;error=diff;}
        }
        if(index<0||notes[seat][index]!==null)return;
        const value=Math.max(1,100-Math.round(error/windowMs*99));
        notes[seat][index]=value;
        landed[seat]++;
        pads[seat].dataset.hit=String(index);
        const offset=t-beats[index];
        previews[seat].dataset.timing=value>=90?'exact':offset<0?'early':'late';
        previews[seat].textContent=value>=90?'◎ ぴったり':offset<0?'← 少し早い':'少し遅い →';
        reads[seat].textContent=total(seat)+' 点';
      }
      function paint(now){
        if(done)return;
        const t=now-origin;
        let next=beats.findIndex(at=>at>=t-155);
        if(next<0)next=beats.length-1;
        const distance=beats[next]-t;
        const passed=beats.filter(at=>t>at+windowMs).length;
        const ready=t < -windowMs;
        const beatLabel=ready ? (t<-640?'準備 3':t<-320?'準備 2':'準備 1')
          : '拍 '+Math.min(beats.length,passed+1)+' / '+beats.length;
        for(let s=0;s<2;s++){
          marks[s].style.left=Math.max(0,Math.min(100,50+distance*.077))+'%';
          tracks[s].dataset.onBeat=String(Math.abs(distance)<90);
          tracks[s].dataset.beat=String(next+1);
          tracks[s].dataset.ready=String(ready);
          setText(counters[s],beatLabel);
          setText(status[s],'成功 '+landed[s]+' / '+beats.length);
          const misses=notes[s].slice(0,passed).filter(value=>value===null).length;
          if(misses>missed[s]){
            missed[s]=misses;
            previews[s].dataset.timing='miss';
            setText(previews[s],'× 見送り');
          }
        }
        if(distance<=0&&distance>=-155&&lastCue!==next){lastCue=next;ctx.fx.cue();}
        frame=requestAnimationFrame(paint);
      }
      ctx.turn(null);
      for(let s=0;s<2;s++){
        const panel=make('div','bell-panel'), track=make('div','bell-track');
        track.setAttribute('aria-hidden','true');
        const line=make('span','bell-line'), marker=make('span','bell-marker');
        track.append(line,marker);tracks.push(track);marks.push(marker);
        const read=make('span','bell-score');read.textContent='0 点';reads.push(read);
        const preview=make('span','bell-feedback');preview.textContent='中央で押す';previews.push(preview);
        const pad=ctx.button(s,'鐘を鳴らす',e=>{if(e.detail===0)hit(s,e);});
        pad.classList.add('bell-pad');pads.push(pad);
        pad.addEventListener('pointerdown',e=>{if(e.button===0&&pad.isConnected)hit(s,e);});
        const count=make('span','bell-count');count.textContent='準備 3';counters.push(count);
        const hint=make('span','bell-landed');hint.textContent='成功 0 / '+beats.length;status.push(hint);
        panel.append(count,hint,track,read,preview,pad);ctx.zones[s].append(panel);
      }
      ctx.say('中央の線に重なったらタップ');
      ctx.cleanup(()=>{done=true;cancelAnimationFrame(frame);});
      frame=requestAnimationFrame(paint);
      ctx.later(()=>{
        const a=total(0), b=total(1);
        ctx.finish(a===b?null:a>b?0:1,'1P '+a+' 点（成功 '+landed[0]+'回）　2P '+b+' 点（成功 '+landed[1]+'回）'+(a===b?'　引き分け！':''));
      },Math.ceil(Math.max(0,cutoff-performance.now()))+12);
    }};}
  });
})();

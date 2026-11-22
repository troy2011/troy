(() => {
'use strict';
const catalog=window.tavernNewGames??=[];
const other=s=>1-s, clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const decorate=(ctx,id,name,category,icon,description,run)=>ctx.push({id,name,category,icon,description,create(c){return {start(){run(c);}};}});
function engine(c,step,paint){
 let id=0, previous=performance.now(), stopped=false;
 function stop(){stopped=true;cancelAnimationFrame(id);}
 c.cleanup(stop);
 function next(now){if(stopped)return;const dt=clamp((now-previous)/1000,0,.05);previous=now;if(step(dt)){paint();if(!stopped)id=requestAnimationFrame(next);}}
 id=requestAnimationFrame(next);return stop;
}
function create(parent,tag,props={}){const el=document.createElement(tag);Object.assign(el,props);parent.append(el);return el;}
function makeBoard(zone,label){
 const el=create(zone,'div');el.dataset.physicsBoard='';el.setAttribute('role','img');el.setAttribute('aria-label',label);
 el.style.cssText='position:relative;width:min(94%,260px);height:clamp(44px,14vh,100px);overflow:hidden;border:1px solid #b18a59;border-radius:8px;background:#172624';
 return el;
}
function marker(board,width,height,color){const el=create(board,'span');el.style.cssText='position:absolute;pointer-events:none;transform:translate(-50%,-50%);border-radius:5px;box-sizing:border-box;border:1px solid #17110d;width:'+width+'%;height:'+height+'%;background:'+color;return el;}
function pos(marker,x,y){marker.style.left=x*100+'%';marker.style.top=y*100+'%';}
function getButtons(c,s,move){
 const row=create(c.zones[s],'div');row.style.cssText='display:flex;gap:6px;justify-content:center;touch-action:none';
 const pressed=[new Set(),new Set()];
 const sync=()=>move(Number(pressed[1].size>0)-Number(pressed[0].size>0));
 const keys=s===0?['a','d']:['j','l'];
 ['◀ 左','右 ▶'].forEach((label,i)=>{
  const b=create(row,'button',{textContent:label,type:'button'});b.style.cssText='min-height:44px;min-width:57px;padding:0 8px;touch-action:none;color:#fff2d1;background:#271b14;border:1px solid #c59759;border-radius:6px';
  b.dataset.physicsDirection=String(i);b.setAttribute('aria-label',label+'（'+keys[i].toUpperCase()+'）');
  const down=id=>{pressed[i].add(id);sync();};const up=id=>{pressed[i].delete(id);sync();};
  const cancel=()=>{pressed[i].clear();sync();};
  b.onpointerdown=e=>{if(e.button!==0)return;b.setPointerCapture(e.pointerId);down(e.pointerId);};
  b.onpointerup=b.onpointercancel=b.onlostpointercapture=e=>up(e.pointerId);
  b.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();down('focus');}};
  b.onkeyup=e=>{if([' ','Enter'].includes(e.key))up('focus');};b.onblur=()=>up('focus');
  const keyboard=e=>{if(e.key.toLowerCase()!==keys[i]||e.ctrlKey||e.altKey||e.metaKey)return;e.preventDefault();if(e.type==='keydown')down('short');else up('short');};
  window.addEventListener('keydown',keyboard);window.addEventListener('keyup',keyboard);window.addEventListener('blur',cancel);
  c.cleanup(()=>{cancel();window.removeEventListener('keydown',keyboard);window.removeEventListener('keyup',keyboard);window.removeEventListener('blur',cancel);b.disabled=true;});
 });
}
decorate(catalog,'deck-balance','甲板バランス','timing','◈','左右を押し続け、転がる金貨を甲板に残そう。',(c)=>{
 c.clear();c.say('左右を押して金貨を守れ！');
 const seats=[0,1].map(s=>{
  const board=makeBoard(c.zones[s],'金貨を左右に傾けて落とさない');
  const coin=marker(board,8,22,'#f6cd74');coin.style.borderRadius='50%';const rail=marker(board,96,7,'#ae8154');pos(rail,.5,.69);
  const o={board,rail,coin,x:.5,v:0,input:0,lostAt:null};getButtons(c,s,d=>o.input=d);return o;
 });
 const wind=[0,1,2].map(()=>c.random(628)/100);let t=0;
 function paint(){for(const o of seats){pos(o.coin,clamp(o.x,0,1),.52);o.rail.style.transform='translate(-50%,-50%) rotate('+(o.input*5)+'deg)';o.board.style.borderColor=o.lostAt===null?'#b18a59':'#eb9076';}}
 paint();
 engine(c,dt=>{
  t+=dt;const push=.47*Math.sin(t*2.25+wind[0])+.26*Math.sin(t*4.01+wind[1])+.15*Math.cos(t*7+wind[2]);
  for(const o of seats){if(o.lostAt!==null)continue;o.v=(o.v+(push+o.input*.96)*dt)*Math.exp(-dt*1.1);o.x+=o.v*dt;if(o.x<=.035||o.x>=.965)o.lostAt=t;}
  const lost=seats.map(o=>o.lostAt!==null);
  if(lost.some(Boolean)||t>=18){paint();c.finish(lost[0]===lost[1]?null:lost[0]?1:0,lost.some(Boolean)?'落ちた金貨で勝負':'18秒間、どちらも金貨を守った');return false;}
  return true;
 },paint);
});
decorate(catalog,'barrel-rally','樽ラリー','reflex','◉','左右で板を動かし、樽を打ち返す。5点先取。',(c)=>{
 c.clear();c.say('左右を押して板を動かす。5点先取。');
 const points=[0,0], paired=[0,0];
 const seats=[0,1].map(s=>{
  const standing=c.text(s,'0 点','tavern-puzzle');
  const board=makeBoard(c.zones[s],'相手と樽を打ち合う盤面'), paddle=[marker(board,23,8,'#edbe74'),marker(board,23,8,'#82beb6')], barrel=marker(board,5,11,'#d98851');
  const o={standing,board,paddle,barrel,x:.5,d:0};getButtons(c,s,d=>o.d=d);return o;
 });
 let x=.5,y=.5,vx=0,vy=0,serve=0,pause=.85,elapsed=0;const first=c.random(2);
 function paint(){
  for(let s=0;s<2;s++){
   const o=seats[s];const flip=s===0;
   if(o.standing?.nodeType)o.standing.textContent=points[s]+' 点';else{const text=c.zones[s].querySelector('.tavern-puzzle');if(text)text.textContent=points[s]+' 点';}
   pos(o.paddle[0],flip?1-seats[1].x:seats[0].x,.10);pos(o.paddle[1],flip?1-seats[0].x:seats[1].x,.90);pos(o.barrel,flip?1-x:x,flip?1-y:y);
  }
 }
 function nextServe(){x=.5;y=.5;pause=.72;vx=(serve%2===0?1:-1)*(Math.floor(serve/2)%2===0?1:-1)*.12;vy=(serve%2===first?1:-1)*.55;serve++;}
 nextServe();paint();
 engine(c,dt=>{
  elapsed+=dt;
  for(let s=0;s<2;s++){const o=seats[s];o.x=clamp(o.x+(s===0?-o.d:o.d)*dt*.8,.12,.88);}
  if(elapsed>=75){c.finish(paired[0]===paired[1]?null:Number(paired[1]>paired[0]),'成立した組：1P '+paired[0]+' ／ 2P '+paired[1]);return false;}
  if(pause>0){pause-=dt;return true;}
  const oldY=y;x+=vx*dt;y+=vy*dt;
  if(x<.035||x>.965){x=clamp(x,.035,.965);vx=-vx;}
  for(const s of [0,1]){const line=s===0?.135:.865, toward=s===0?vy<0:vy>0;
   if(toward&&((s===0&&oldY>=line&&y<=line)||(s===1&&oldY<=line&&y>=line))&&Math.abs(x-seats[s].x)<=.138){y=line;vy=-Math.sign(vy)*Math.min(.95,Math.abs(vy)*1.065);vx=clamp(vx+(x-seats[s].x)*1.32,-.54,.54);}
  }
  if(y<-.04||y>1.04){const loser=y<0?0:1;points[other(loser)]++;if(serve%2===0){paired[0]=points[0];paired[1]=points[1];}
   // Two matched serves before declaring a result; both seats receive the same number of incoming serves.
   if(serve%2===0&&Math.max(...points)>=5&&points[0]!==points[1]){paint();c.finish(Number(points[1]>points[0]),'1P '+points[0]+' ／ 2P '+points[1]);return false;}
   if(serve%2===0&&points[0]===points[1]&&points[0]>=5){paint();c.finish(null,'1P '+points[0]+' ／ 2P '+points[1]);return false;}
   nextServe();
  }
  return true;
 },paint);
});
})();

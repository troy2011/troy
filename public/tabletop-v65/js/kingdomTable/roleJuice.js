import {roleAccentKey} from './roleAccents.js?v=role-foley-v1';
import * as Fx from './effects.js?v=field-pose-v1';
import * as Sfx from './sfx.js?v=whisky-v2';
import {ROLE_SETTLE_MS,ROLE_SLAM_MS,ROLE_TAKE_MS} from './roleJuicePlan.js?v=role-cutin-v1';

import {ROLE_CUTIN_MS,roleAnticipationMs,startRoleLanding} from './roleCinematic.js?v=sites-role-timing-v1';

const SUIT_COLOR={wand:'#eb7068',cup:'#70b3f5',coin:'#77cd92',sword:'#efd164'};
const SHAKE=[0,2,5,8];
const rect=node=>node?.getBoundingClientRect();
const centre=box=>({x:box.left+box.width/2,y:box.top+box.height/2});
function bounds(nodes) {
    const boxes=nodes.map(rect);
    const left=Math.min(...boxes.map(box=>box.left)), top=Math.min(...boxes.map(box=>box.top));
    return {left,top,width:Math.max(...boxes.map(box=>box.right))-left,height:Math.max(...boxes.map(box=>box.bottom))-top};
}

function finishRole(plan, table, boxes, color, accent, impactUntil, cheer) {
    // The final cannon/chord AND the flash/shake are invoked from one callback.
    const point=centre(boxes);
    if (plan.kind==='straight') Fx.streak(boxes);
    if (plan.kind==='flush') { Fx.roleFlash(color); Fx.burst(point,26,[color,'#fff'],150); }
    if (plan.kind==='fullhouse') { Fx.impact(boxes,{strong:true}); Fx.shake(table,10); Fx.burst(point,16,['#ffe08a','#ff9b6b'],120); }
    if (plan.kind==='four') { Fx.flash('gold'); Fx.shake(table,13); Fx.impact(boxes,{strong:true}); Fx.burst(point,34,['#ffe08a','#ff7a4d','#fff'],190); }
    if (plan.kind==='straightflush') { Fx.streak(boxes,color); Fx.roleFlash(color); Fx.shake(table,12); Fx.burst(point,34,[color,'#fff','#ffe08a'],190); }
    if (accent) Sfx.completeRole(plan.role,impactUntil,cheer);
    else Sfx.roleSound(plan.kind);
}

export function animateRole(plan,{nodes,table,cardNode,source,origin,mine,borrowedFrom,at,sweepBefore,legacy,finishing,app,face,cheer,alreadyPaced=false}) {
    const target=card=>nodes.get(card.id);
    const targets=plan.beats.map(beat=>target(beat.card));
    const boxes=bounds(targets), color=SUIT_COLOR[plan.suit]||'#fff2c2';
    const moving=Fx.moving(), accent=roleAccentKey(plan.role);
    if(!moving){
        Fx.after(at,sweepBefore,()=>{if(!plan.kind)legacy?.(!accent);
            if(accent)Sfx.completeRole(plan.role,null,cheer);else if(plan.kind)Sfx.roleSound(plan.kind);});
        return {span:at,ready:null};
    }
    targets.forEach(node=>node.classList.add('is-arriving'));
    const slots=new Map(targets.map(node=>[node.dataset.card,Fx.fieldCardPose(node)]));
    const reveal=node=>{
        if(node?.isConnected){
            node.classList.remove('is-arriving');
            node.classList.add('is-landed');
        }
    };
    let impactUntil = null;
    const closer=finishing ? plan.own.reduce((a,b)=>!a||b.delay>=a.delay?b:a,null) : null;
    const endingLand=closer?closer.delay+Fx.AGARI_PAUSE_MS+Fx.AGARI_SLAM_MS:0;
    const insertAt=plan.borrowed?Math.max(plan.borrowed.delay,endingLand):0;
    const live=()=>targets.every(node=>node?.isConnected);
    const wait=roleAnticipationMs(alreadyPaced);
    const launch=finish=>{
        const pending=[];
        const groups=new Map();
        for(const beat of plan.own) {
            if(beat===closer)continue;
            if(!groups.has(beat.delay))groups.set(beat.delay,[]);
            groups.get(beat.delay).push(beat);
        }
        const lastOwnDelay=Math.max(...plan.own.map(beat=>beat.delay));
        for(const [delay,group] of groups) {
            const power=Math.max(...group.map(beat=>beat.power));
            Fx.later(delay,()=>{if(live()&&(!mine||power>1))Sfx.roleSound('throw');});
            const waits=group.map(beat=>{
                const node=target(beat.card), to=slots.get(beat.card.id);
                const from=origin(beat.card)||source||to;
                const spin=mine?-8:(beat.index%2?1:-1)*(150+(beat.index*37)%90);
                return Fx.slam(cardNode(beat.card),from,to,{duration:ROLE_SLAM_MS,delay,spin,thrown:!mine}).then(()=>reveal(node));
            });
            pending.push(Promise.all(waits).then(()=>{
                if(!live())return;
                // Simultaneous landings are one tactile cue, never three stacked samples.
                if (!accent || closer || plan.borrowed || delay !== lastOwnDelay) Sfx.roleSound('card',power);
                group.forEach(beat=>{
                    Fx.impact(slots.get(beat.card.id),{strong:power===3});
                    if(plan.rank===1||plan.rank===6)Sfx.roleSound('step',beat.index);
                });
                Fx.shake(table,SHAKE[power]);
            }));
        }
        if(closer){
            const node=target(closer.card), to=slots.get(closer.card.id);
            const from=origin(closer.card)||source||to;
            const ghost=cardNode(closer.card);
            ghost.classList.add('kt-fx-agari-slam');
            const delay=closer.delay+Fx.AGARI_PAUSE_MS;
            Fx.later(delay+Fx.AGARI_SLAM_MS-160,()=>{if(live())Sfx.roleSound('finishWindup');});
            pending.push(Fx.slam(ghost,from,to,{...Fx.AGARI_FLIGHT,duration:Fx.AGARI_SLAM_MS,delay,spin:-8}).then(()=>{
                reveal(node);
                if(!live())return;
                Fx.agariStrike(to,table,app,mine,plan.rank===2||plan.rank===6?color:undefined);
                if (accent) impactUntil = Sfx.playTableImpact('role');
                else Sfx.roleSound('finish');
                if(plan.rank===1||plan.rank===6)Sfx.roleSound('step',closer.index);
            }));
        }
        if(plan.borrowed) {
            const beat=plan.borrowed,node=target(beat.card),to=slots.get(beat.card.id);
            if(borrowedFrom){
                Fx.later(240,()=>{if(live())Sfx.roleSound('take');});
                pending.push(Fx.take(cardNode(beat.card),borrowedFrom,to,{liftAt:240,hold:insertAt,duration:ROLE_TAKE_MS}).then(()=>{
                    reveal(node);
                    if(!live())return;
                    if(!accent || closer) Sfx.roleSound('snap');
                    if(plan.rank===1||plan.rank===6)Sfx.roleSound('step',beat.index);
                    Fx.impact(to,{strong:false});Fx.shake(table,5);
                }));
            } else {
                // Snapshot jumped directly to the call. Do not invent an old location, but keep the borrowed slot/cue last.
                pending.push(new Promise(resolve=>Fx.later(insertAt+ROLE_TAKE_MS,()=>{
                    reveal(node);
                    if(live()){if(!accent || closer) Sfx.roleSound('snap');if(plan.rank===1||plan.rank===6)Sfx.roleSound('step',beat.index);}
                    resolve();
                })));
            }
        }
        Fx.after(0,Promise.all(pending),()=>{
            // The finale and its sound belong to the landing, not to a second cut-in.
            if(live()){
                if(plan.kind)finishRole(plan,table,boxes,color,accent,impactUntil,cheer);
                else { legacy?.(!accent); if(accent)Sfx.completeRole(plan.role,impactUntil,cheer); }
            }
            Fx.later(ROLE_SETTLE_MS,finish);
        });
    };
    const ready=startRoleLanding(Fx,{at:at+wait,sweepBefore,face,live,launch});
    return {span:at+wait+ROLE_CUTIN_MS+Math.max(plan.span,endingLand+ROLE_SETTLE_MS,insertAt?insertAt+ROLE_TAKE_MS+ROLE_SETTLE_MS:0),ready};
}

// Hand-checked eye centers in a 240 × 180 reference grid, keyed to v31 art.
// A single visible eye is intentional for side profiles.
const avatarEyes = [
    [[119,38],[129,33]], [[117,35],[134,30]], [[118,29],[133,27]],
    [[107,44],[125,38]], [[109,34],[131,32]], [[101,22],[113,21]],
    [[124,40],[146,48]], [[121,27],[136,23]], [[100,35],[116,29]],
    [[131,35],[142,38]], [[112,41],[125,40]], [[113,35],[134,29]],
    [[102,31],[119,28]], [[116,38],[130,35]], [[122,32],[139,37]],
    [[120,32],[139,36]], [[99,72],[140,72]], [[140,30],[153,29]],
    [[108,36],[131,37]], [[105,38],[127,36]], [[125,29],[138,28]],
    [[112,35],[131,38]],
];
const tavernEyes={
    captain: {height:427, eyes:[[127,53]]},
    rogue: {height:587, eyes:[[94,38],[107,33]]},
    sailor: {height:497, eyes:[[99,35],[112,31]]},
};
export const ROLE_CUTIN_MS=410;
const SVG='http://www.w3.org/2000/svg';
const svg=(tag,attrs)=>{
    const n=document.createElementNS(SVG,tag);
    for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));
    return n;
};

export function roleFace(avatar, tavern, portraitRoot) {
    if(avatar && avatarEyes[avatar.id])return {src:avatar.portrait,height:560,eyes:avatarEyes[avatar.id]};
    return tavern && tavernEyes[tavern] ? {...tavernEyes[tavern],src:`${portraitRoot}/${tavern}.webp`} : null;
}

export function cutinPortrait(face) {
    const h=face.height*240/640;
    const points=face.eyes.map(([x,y])=>[x,y*h/180]);
    const x=points.reduce((sum,p)=>sum+p[0],0)/points.length;
    const y=points.reduce((sum,p)=>sum+p[1],0)/points.length;
    const art=svg('svg',{viewBox:`${x-89} ${y-27} 178 60`,preserveAspectRatio:'xMidYMid meet',class:'kt-role-cutin-art'});
    art.append(svg('image',{href:face.src,width:240,height:h}));
    for(const [cx,cy] of points) {
        art.append(svg('path',{d:`M${cx-4.5},${cy} l3.7,-.8 .8,-3 .8,3 3.7,.8 -3.7,.8 -.8,3 -.8,-3z`,class:'kt-role-cutin-eye'}));
    }
    return art;
}

// CPU turns already spent their variable thinking time before committing a role.
export const roleAnticipationMs = (alreadyPaced, random = Math.random) => alreadyPaced ? 0 : 240 + Math.floor(random() * 281);

// Keep the cut-in and card launches on the same cancellable presentation gate.
export function startRoleLanding(fx, { at, sweepBefore, face, live, launch }) {
    return fx.untilRoleReady(finish => fx.after(at, sweepBefore, () => {
        if (!live()) { finish(); return; }
        fx.roleCutin(face, () => {
            if (!live()) { finish(); return; }
            launch(finish);
        });
    }));
}

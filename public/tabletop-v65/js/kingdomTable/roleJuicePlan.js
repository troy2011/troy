import { numberKey, roleRank, SUITS, suitsOf } from './rules.js?v=20261117-death-justice-trial-v1';

export const ROLE_JUICE_KIND=Object.freeze({1:'straight',2:'flush',3:'fullhouse',4:'four',6:'straightflush'});
export const ROLE_SLAM_MS=380;
export const ROLE_TAKE_MS=220;
export const ROLE_SETTLE_MS=60;
const isFool=card=>card.major&&card.num===0;
const byRank=(a,b)=>a.num-b.num||Number(a.major)-Number(b.major);

export function layoutRole(cards,role) {
    if (!role || cards.length!==5) return cards;
    const rank=roleRank(role);
    if (rank===3 || rank===4) {
        const groups=new Map(), fool=cards.find(isFool);
        for(const card of cards.filter(card=>!isFool(card))) {
            const key=numberKey(card);
            if(!groups.has(key)) groups.set(key,[]);
            groups.get(key).push(card);
        }
        const sizes=[...groups.values()].sort((a,b)=>b.length-a.length || b[0].num-a[0].num);
        if(fool && rank===3 && sizes[0]?.length===2) sizes.find(group=>group[0].num===role.tb[0])?.push(fool);
        else if(fool && rank===4 && sizes[0]?.length===3) sizes[0].push(fool);
        if(fool && !sizes.some(group=>group.includes(fool))) sizes.push([fool]);
        return sizes.sort((a,b)=>a.length-b.length || a[0].num-b[0].num).flatMap(group=>group.sort(byRank));
    }
    if(rank===1 || rank===6 || rank===8) {
        const top=role.tb[0], min=top-4;
        const rankOf=card=>!card.major&&card.num===15&&top<15?1:card.num;
        const occupied=new Set(cards.filter(card=>!isFool(card)).map(rankOf));
        const wild=Array.from({length:5},(_,i)=>min+i).find(n=>!occupied.has(n))??top;
        const value=card=>isFool(card)?wild:rankOf(card);
        return [...cards].sort((a,b)=>value(a)-value(b)||byRank(a,b));
    }
    return [...cards].sort(byRank);
}

export function makeRoleJuice(event,allCards,taken=null) {
    if(!event.role || allCards.length!==5)return null;
    const rank=roleRank(event.role), kind=ROLE_JUICE_KIND[rank];
    // Other high roles retain the existing fanfare after the completed hand is shown.
    const cards=layoutRole(allCards,event.role);
    let delays=cards.map((_,i)=>i*20);
    let powers=cards.map(()=>2);
    if(rank===1||rank===6)delays=cards.map((_,i)=>i*105);
    if(rank===2)delays=cards.map((_,i)=>i*30);
    if(rank===3){delays=[0,80,460,460,460];powers=[2,2,3,3,3];}
    if(rank===4){delays=[0,360,470,580,700];powers=[1,2,2,3,3];}
    // High Elemental keeps the legend banner and lands its five visible cards distinctly.
    if(rank===9){delays=[0,85,170,255,340];powers=[1,2,2,3,3];}
    const beats=cards.map((card,index)=>({card,index,delay:delays[index],power:powers[index],taken:card.id===taken?.id}));
    const own=beats.filter(beat=>!beat.taken);
    const borrowed=beats.find(beat=>beat.taken);
    if(borrowed)borrowed.delay=Math.max(...own.map(beat=>beat.delay))+190;
    const suit=SUITS.find(s=>cards.every(card=>suitsOf(card).includes(s))) ||
       event.cards.find(card=>!card.major)?.suit;
    return {rank,kind,role:event.role,beats,own,borrowed,suit,span:Math.max(...own.map(beat=>beat.delay+ROLE_SLAM_MS),borrowed?borrowed.delay+ROLE_TAKE_MS:0)+ROLE_SETTLE_MS};
}

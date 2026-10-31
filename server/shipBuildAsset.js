'use strict';
// Build immutable personal-ship data only from trusted server catalog values.
// No IO, no mutation and no active-ship switch. Registration is separate.
function createShipBuildAsset({playerId,shipId,shipItemId,shipClass,spec}){
 const owner=String(playerId||'').trim().replace(/^playfab:/i,'').trim().toUpperCase();
 if(!/^[A-Z0-9]+$/.test(owner)||typeof shipId!=='string'||!new RegExp('^ship_'+owner+'_[a-f0-9]{20}$').test(shipId)||typeof shipItemId!=='string'||!shipItemId||!['none','common','explorer','merchant','fighter','defender'].includes(shipClass)||!spec||typeof spec!=='object')throw Error('InvalidShipAsset');
 const number=(name,min,max)=>{const raw=spec[name];if(typeof raw!=='number'&&typeof raw!=='string')throw Error('InvalidShipAsset');const n=Number(raw);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('InvalidShipAsset');return n};
 const hp=number('MaxHP',1,1000000),speed=number('Speed',0,1000000),cargo=number('CargoCapacity',0,1000000),crew=number('CrewCapacity',1,1000000);
 const vision=spec.VisionRange===undefined?300:number('VisionRange',0,1000000),baseFrame=spec.baseFrame===undefined?0:number('baseFrame',0,1000000);
 const name=typeof spec.DisplayName==='string'?spec.DisplayName.trim():'';if(!name||name.length>200)throw Error('InvalidShipAsset');
 const domain=spec.Domain===undefined?'sea_surface':String(spec.Domain);if(!['sea_surface','sea_underwater','air'].includes(domain))throw Error('InvalidShipAsset');
 const skills=spec.Skills===undefined?[]:spec.Skills;if(!Array.isArray(skills)||JSON.stringify(skills).length>16000)throw Error('InvalidShipAsset');
 const stats={MaxHP:hp,Speed:speed,CargoCapacity:cargo,CrewCapacity:crew,VisionRange:vision};
 return {ShipId:shipId,ShipType:name,ItemId:shipItemId,BuildShipClass:shipClass,baseFrame,Domain:domain,Level:1,BaseStats:{...stats},Stats:{...stats,CurrentHP:hp},Skills:structuredClone(skills),Equipment:{Cannon:null,Sail:null,Hull:null,Anchor:null},Cargo:[],ResourceCargo:{RR:0,RG:0,RY:0,RB:0,RT:0,RS:0},Crew:[{PlayFabId:owner,Role:'Captain'}],Owner:owner};
}
module.exports={createShipBuildAsset};

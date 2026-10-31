'use strict';
// className, nation and fallbackCosts must come from authenticated
// server-side player data and catalog. No client-provided price is trusted.
const nationResource={fire:'RR',earth:'RG',wind:'RY',water:'RB'};
const alias={wands:'fire',pentacles:'earth',swords:'wind',cups:'water'};
const availableResources=new Set(['RR','RG','RY','RB']);
function quoteBuild({className,nation,selectedResource,fallbackCosts}) {
  const type=String(className||'').trim().toLowerCase();
  const rawNation=typeof nation==='string'?nation.trim().toLowerCase():null;
  const nationKey=rawNation==='neutral'?'':(alias[rawNation]||rawNation);
  if(rawNation === null || (nationKey !== '' && !nationResource[nationKey])) throw Error('NationUnverified');
  if(['explorer','merchant','fighter','defender'].includes(type)) {
    // A successful, explicitly empty nation is distinct from unknown data.
    const resource=nationResource[nationKey] || String(selectedResource||'').trim().toUpperCase();
    if(!availableResources.has(resource)) throw Error('ChooseMaterial');
    return type==='explorer' ? [{itemId:'RT',amount:10},{itemId:resource,amount:25}]
      : [{itemId:'RS',amount:1},{itemId:resource,amount:50}];
  }
  if(!Array.isArray(fallbackCosts) || !fallbackCosts.length)throw Error('CatalogPriceUnavailable');
  const merged=new Map();
  for(const cost of fallbackCosts) {
    if(typeof cost.itemId!=='string'||!cost.itemId||!Number.isSafeInteger(cost.amount)||cost.amount<=0)throw Error('CatalogPriceUnavailable');
    const total=(merged.get(cost.itemId)||0)+cost.amount;if(!Number.isSafeInteger(total))throw Error('CatalogPriceUnavailable');merged.set(cost.itemId,total);
  }
  return Array.from(merged,([itemId,amount])=>({itemId,amount}));
}
module.exports={quoteBuild};

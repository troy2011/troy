'use strict';
// Authenticated player IDs and the cache/resolver come from server code.
const {applyDerivedPlayerLevelToStats,buildStatsMapFromStatistics}=require('./playerLevel');
// Reuse the server-loaded catalog price for the common boat; never trust a
// client quote or silently substitute a guessed amount. PS is TROY's G balance.
function verifyCommonBoatCosts({item,catalogCurrencyMap,resolveItemId}){
 if(!item||typeof resolveItemId!=='function'||!catalogCurrencyMap||!Array.isArray(item.PriceAmounts)||item.PriceAmounts.length!==1)return null;
 const price=item.PriceAmounts[0],raw=price?.ItemId??price?.itemId,amount=price?.Amount??price?.amount;
 if(typeof raw!=='string'||!raw||!Number.isSafeInteger(amount)||amount<=0)return null;
 const resolved=resolveItemId(raw);if(typeof resolved!=='string'||!resolved||String(catalogCurrencyMap[resolved]||'').toUpperCase()!=='PS')return null;
 return [{itemId:'PS',amount}];
}
function createShipBuildInputs({promisifyPlayFab,PlayFabServer,catalogCache,resolveItemId,verifyFallbackCosts}){
 if(typeof promisifyPlayFab!=='function'||typeof PlayFabServer?.GetUserReadOnlyData!=='function'||typeof PlayFabServer?.GetPlayerStatistics!=='function'||!catalogCache||typeof resolveItemId!=='function')throw Error('InputDependenciesUnavailable');
 const canonical=p=>{const id=String(p||'').trim().replace(/^playfab:/i,'').trim().toUpperCase();if(!/^[A-Z0-9]+$/.test(id))throw Error('InvalidIdentity');return id};
 async function getPlayer(player){const id=canonical(player);const [read,stat]=await Promise.all([
  promisifyPlayFab(PlayFabServer.GetUserReadOnlyData,{PlayFabId:id,Keys:['Race','Nation']}),
  promisifyPlayFab(PlayFabServer.GetPlayerStatistics,{PlayFabId:id})]);
  if(!read?.Data||typeof read.Data!=='object'||!Array.isArray(stat?.Statistics))throw Error('PlayerDataUnavailable');
  const race=String(read.Data.Race?.Value||'').trim().toLowerCase();if(!race)throw Error('PlayerDataUnavailable');
  const rawNation=read.Data.Nation?.Value;if(rawNation!==undefined&&rawNation!==null&&typeof rawNation!=='string')throw Error('PlayerDataUnavailable');
  const nation=String(rawNation||'').trim().toLowerCase();
  if(!['','neutral','fire','water','wind','earth','wands','cups','swords','pentacles'].includes(nation))throw Error('NationUnverified');
  const stats=applyDerivedPlayerLevelToStats(buildStatsMapFromStatistics(stat.Statistics)).stats;
  const level=Math.max(1,Math.floor(Number(stats.Level||1)||1));return {race,nation,level,unaffiliated:nation===''||nation==='neutral'};}
 async function getCatalogEntry(itemId){if(typeof itemId!=='string'||!itemId)throw Error('InvalidShip');
  const resolved=resolveItemId(itemId);if(typeof resolved!=='string'||!resolved)throw Error('InvalidShip');const item=catalogCache[resolved];
  if(!item||String(item.ItemClass||'').toLowerCase()!=='ship')throw Error('InvalidShip');
  const shipClass=String(item.class||item.Class||'').trim().toLowerCase(),race=String(item.race||item.Race||'').trim().toLowerCase();
  if(!['none','common','explorer','merchant','fighter','defender'].includes(shipClass)||!race)throw Error('InvalidShip');
  const assetFields=['DisplayName','MaxHP','Speed','CargoCapacity','CrewCapacity','VisionRange','baseFrame','Domain','Skills'];
  const assetSpec=Object.fromEntries(assetFields.filter(key=>item[key]!==undefined).map(key=>[key,structuredClone(item[key])]));
  const result={itemClass:'Ship',itemId,shipClass,race,assetSpec};
  // Never fall back to a client-supplied price.
  if(['none','common'].includes(shipClass)&&typeof verifyFallbackCosts==='function')result.verifiedFallbackCosts=await verifyFallbackCosts(item);
  return result;}
 // Catalog is display-only; the quote and build paths re-read and validate the
 // chosen entry. Never use the browser's list as authority for cost or race.
 async function listCatalog(account){
  const race=String(account?.race||'').trim().toLowerCase(),entries=[];
  if(!race)throw Error('PlayerDataUnavailable');
  for(const [key,item] of Object.entries(catalogCache)){
   if(!item||String(item.ItemClass||'').toLowerCase()!=='ship')continue;
   const id=String(item.ItemId||'').trim();
   if(!id||id!==key)throw Error('CatalogUnavailable');
   const spec=await getCatalogEntry(id);
   if(spec.race!=='common'&&spec.race!==race)continue;
   const name=typeof item.DisplayName==='string'?item.DisplayName.trim():'';
   if(!name)throw Error('CatalogUnavailable');
   entries.push({id,name});
  }
  return entries;
 }
 return {getPlayer,getCatalogEntry,listCatalog};
}
module.exports={createShipBuildInputs,verifyCommonBoatCosts};

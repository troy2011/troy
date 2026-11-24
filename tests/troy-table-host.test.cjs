const {test}=require('node:test');
const assert=require('node:assert/strict');
const url='../public/tabletop-v65/js/kingdomTable/tableHost.js';

test('only the HTML-selected tabletop host accepts each matching transport',async()=>{
 const {resolveTableHost}=await import(url);
 const local=await import('../public/tabletop-v65/js/kingdomTable/localTable.js');
 const sites={...local,kind:'sites',online:{view:{code:'ROOM'}}};
 assert.equal(resolveTableHost('troy',local),local);
 assert.equal(resolveTableHost('sites',sites),sites);
 assert.equal(local.online.view,null);
 assert.throws(()=>resolveTableHost('sites',local),/Mismatched/);
 assert.throws(()=>resolveTableHost('troy',sites),/Mismatched/);
 for(const entry of [undefined,'','online','troy?sites']) assert.throws(()=>resolveTableHost(entry,sites),/Mismatched/);
 assert.throws(()=>resolveTableHost('sites',{kind:'sites',online:{}}),/Incomplete/);
});

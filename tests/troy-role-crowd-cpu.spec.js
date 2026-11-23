const {test,expect}=require('@playwright/test');
const catalog=require('../public/tabletop-v65/assets/tarot-kingdom-table/role-crowd-preview/catalog.json');
for(const ending of [false,true]) test('local AI '+(ending?'five-card out plays one round-out clip':'non-finishing five-card layers nearby and far voices'),async({page})=>{
  const R=await import('../public/tabletop-v65/js/kingdomTable/rules.js');
  const deck=R.buildDeck(), cards=deck.filter(c=>!c.major&&((c.num===4&&['sword','coin'].includes(c.suit))||(c.num===6&&c.suit!=='wand')));
  const played=['wand-2','sword-3','wand-4','sword-5','wand-6'].map(id=>deck.find(c=>c.id===id));
  const remaining=deck.filter(c=>!cards.concat(played).includes(c));
  const round=R.createRound({players:3});
  Object.assign(round,{players:[remaining.slice(0,2),ending?cards:[...cards,remaining[4]],remaining.slice(2,4)].map(hand=>({hand,grave:[],exiled:[]})),deck:remaining.slice(ending?4:5),aside:[],
    field:{kind:'role',count:5,role:R.evaluateRole(played),plays:[{by:2,cards:played,role:R.evaluateRole(played),kind:'role'}]},
    back:false,lock:null,direction:1,cut:false,passed:[],trashBy:null,judgement:false,han:[0,0,0],lastCardHan:0,last:2,turn:1,drew:false,ceded:0,phase:'play',winner:null,openingWin:null,lastPlay:null,events:[]});
  await page.route('**/api/**',r=>r.fulfill({json:{user:null}}));
  await page.route(/\/js\/kingdomTable\/rules\.js\?v=[^&]+$/,route=>route.fulfill({contentType:'text/javascript',
    body:`export * from '/tabletop-v65/js/kingdomTable/rules.js?fixture=crowd-practice'; export function createRound() { return ${JSON.stringify(round)}; }`,
  }));
  await page.addInitScript(()=>{
    const data=new WeakMap(),clips=new WeakMap();
    window.crowds=[];
    const toArray=Response.prototype.arrayBuffer,decode=AudioContext.prototype.decodeAudioData,start=AudioBufferSourceNode.prototype.start;
    Response.prototype.arrayBuffer=async function(){const b=await toArray.call(this);if(this.url.includes('/role-crowd-preview/') || this.url.includes('/cheers-v1/'))data.set(b,this.url);return b;};
    AudioContext.prototype.decodeAudioData=async function(b){const o=await decode.call(this,b); if(data.has(b))clips.set(o,data.get(b)); return o;};
    AudioBufferSourceNode.prototype.start=function(...args){const file=clips.get(this.buffer);if(file)window.crowds.push(file);return start.apply(this,args);};
  });
  await page.goto('/tarot-kingdom-table.html?v=65');
  await page.locator('[data-tavern-mode=practice]').click();
  await page.locator('input[name=ktSeats][value="3"]').check();
  await page.locator('#ktStart').click();
  await expect.poll(()=>page.evaluate(()=>window.crowds.map(path=>path.split('/').at(-1))),{timeout:14000}).toHaveLength(ending?1:2);
  const [front,back]=await page.evaluate(()=>window.crowds.map(path=>path.split('/').at(-1)));
  if(ending)expect(catalog.categories['round-out']).toContain(front);
  else {expect(catalog.categories.medium).toContain(front);expect(back).toMatch(/^opponent-open-/);}
});

const {test,expect}=require('@playwright/test');
test('local practice AI plays a real five-card role and layers nearby and farther reactions',async({page})=>{
  const R=await import('../public/tabletop-v65/js/kingdomTable/rules.js');
  const deck=R.buildDeck(), cards=deck.filter(c=>!c.major&&((c.num===4&&['sword','coin'].includes(c.suit))||(c.num===6&&c.suit!=='wand')));
  const played=['wand-2','sword-3','wand-4','sword-5','wand-6'].map(id=>deck.find(c=>c.id===id));
  const remaining=deck.filter(c=>!cards.concat(played).includes(c));
  const round=R.createRound({players:3});
  Object.assign(round,{players:[remaining.slice(0,2),cards,remaining.slice(2,4)].map(hand=>({hand,grave:[],exiled:[]})),deck:remaining.slice(4),aside:[],
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
    Response.prototype.arrayBuffer=async function(){const b=await toArray.call(this);if(this.url.includes('/role-crowd-preview/'))data.set(b,this.url);return b;};
    AudioContext.prototype.decodeAudioData=async function(b){const o=await decode.call(this,b); if(data.has(b))clips.set(o,data.get(b)); return o;};
    AudioBufferSourceNode.prototype.start=function(...args){const file=clips.get(this.buffer);if(file)window.crowds.push(file);return start.apply(this,args);};
  });
  await page.goto('/tarot-kingdom-table.html?v=65');
  await page.locator('[data-tavern-mode=practice]').click();
  await page.locator('input[name=ktSeats][value="3"]').check();
  await page.locator('#ktStart').click();
  await expect.poll(()=>page.evaluate(()=>window.crowds.map(path=>path.split('/').at(-1))),{timeout:14000}).toEqual([expect.stringMatching(/^self-(?:open-small-3|open-medium(?:-4)?|reply-small-[23]|reply-climax-4)\.mp3$/),expect.stringMatching(/^opponent-open-(?:small(?:-2)?|medium-2|big)\.mp3$/)]);
});

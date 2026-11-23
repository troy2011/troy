import test from 'node:test';
import assert from 'node:assert/strict';
import { previewCrowdPlan, readCrowdCatalog, CROWD_FAMILIES, crowdPreviewOn } from '../public/tabletop-v65/js/kingdomTable/roleCrowdPreview.js';
const roles = [
    {rank:1},{rank:1,high:'straight'},{rank:2},{rank:2,high:'flush'},
    {rank:3},{rank:3,high:'fullHouse'},{rank:4},{rank:4,high:'elemental'},
    {rank:5},{rank:5,high:'world'},{rank:6},{rank:7},{rank:7,high:'five'},{rank:8},{rank:9,high:'highElemental'}
];
const play = (by, role={rank:3}, kind='role') => ({type:'play',role:{tb:[14],...role},by,kind});
test('15 live rank identities have opening support, subdued rival reactions and differentiated timing',()=>{
    const own = roles.map(role=>{
        const event = play(0,role);
        return previewCrowdPlan([event]).get(event).cue;
    });
    assert.equal(new Set(own.map(c=>c.roleKey)).size,15);
    assert.equal(new Set(own.map(c=>c.offset)).size,15);
    for(const role of roles) {
        const e=play(2,role);
        const cue=previewCrowdPlan([e]).get(e).cue;
        assert.match(cue.family,/^opponent-open/);
        assert.ok(cue.level<=.62);
    }
});
test('visitor perspective, watch enemy-to-enemy quietly, increase own replies, and keep call and J dedicated',()=>{
    const a=play(1),b=play(2),c=play(0),d=play(1),e=play(0),f=play(0,{rank:3},'call'),g=play(0);
    const events=[a,b,c,d,e,f,{type:'clear'},g];
    const plan=previewCrowdPlan(events);
    assert.equal(plan.get(a).cue.family,'opponent-open-medium');
    assert.equal(plan.get(b).cue.family,'opponent-reply-neutral');
    assert.equal(plan.get(b).cue.level,.46);
    assert.equal(plan.get(c).cue.family,'self-reply-big');
    assert.equal(plan.get(e).cue.family,'self-reply-climax');
    assert.equal(plan.has(f),false);
    assert.equal(plan.get(g).cue.family,'self-open-medium');
    assert.deepEqual(previewCrowdPlan(events,{from:2}).get(c),plan.get(c));
    assert.equal(previewCrowdPlan(events,{viewer:2}).get(b).cue.family,'self-reply-medium');
    assert.equal(previewCrowdPlan(events,{silent:g}).get(g).cue,null);
});
test('preview explicitly scoped; catalogue only accepts named local variants',()=>{
    assert.equal(crowdPreviewOn('?room=abc'),false);assert.equal(crowdPreviewOn('?crowdPreview=1'),true);
    const family=CROWD_FAMILIES[0];
    assert.deepEqual(readCrowdCatalog({[family]:[family+'.mp3',family+'.mp3','/x.mp3','https://x.mp3','../'+family+'-2.mp3',family+'-3.mp3']})[family],[family+'.mp3',family+'-3.mp3']);
    assert.equal(Object.keys(readCrowdCatalog()).length,11);
});

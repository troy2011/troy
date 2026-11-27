const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TYPES, compare, initializeFourElementsRoutes, getProfileArcanaCompatibility } = require('../server/fourElements');

test('all 23 outcomes compare symmetrically with an explanation and practical advice', () => {
    for (const a of Object.keys(TYPES)) for (const b of Object.keys(TYPES)) {
        const result = compare(a,b);
        assert.deepEqual(result,compare(b,a));
        assert.match(result.mark,/^[◎○△]$/);
        assert.ok(result.reason && result.advice);
    }
    assert.equal(compare('fire:fire','water:water').mark, '△');
    assert.equal(compare('fire:earth','earth:fire').mark, '◎');
    assert.equal(compare('water:wind','wind:fire').mark, '○');
    assert.equal(compare('toString','world'), null);
    assert.equal(compare('tri:fire:water:earth','wind:wind').mark, '△');
});

function fixture() {
    const profiles = new Map();
    const handlers = new Map();
    const PlayFabServer = { GetUserInternalData: Symbol('read'), UpdateUserInternalData: Symbol('save') };
    let rejectUpdate = false;
    const deps = { PlayFabServer, promisifyPlayFab: async (method, payload) => {
        assert.match(payload.PlayFabId,/^[A-Z0-9]+$/);
        if(method === PlayFabServer.GetUserInternalData) {
            assert.deepEqual(payload.Keys,['MajorArcanaDiagnosisV1']);
            return {Data:{MajorArcanaDiagnosisV1:{Value:profiles.get(payload.PlayFabId)?.key}}};
        }
        assert.equal(method,PlayFabServer.UpdateUserInternalData);
        assert.deepEqual(Object.keys(payload.Data),['MajorArcanaDiagnosisV1']);
        if(rejectUpdate) throw Object.assign(new Error('test storage error'),{code:'fixture'});
        profiles.set(payload.PlayFabId,{key:payload.Data.MajorArcanaDiagnosisV1});
        return {};
    }};
    initializeFourElementsRoutes({post:(path,handler)=>handlers.set(path,handler)}, {
        ...deps, requireAuthenticatedPlayFabId: async (req,res)=>{
            if (!req.uid) { res.status(401).json({error:'Unauthorized'}); return null; }
            if (req.body?.playFabId && req.uid !== req.body.playFabId) { res.status(403).json({error:'Forbidden'}); return null; }
            return req.uid;
        }
    });
    async function run(action,uid,body) {
        const result = {status:200};
        const res = {set:(name,value)=>{assert.deepEqual([name,value],['Cache-Control','private, no-store']);return res;},status:(code)=>(result.status=code,res),json:data=>(result.data=data,res)};
        await handlers.get('/api/four-elements/'+action)({uid,body},res);
        return result;
    }
    return {run,profiles,deps,handlers, rejectSave(value){rejectUpdate=value;}};
}

test('save is account-bound, replaces one key, and has no sharing switch or roster end point', async () => {
    const {run,profiles,handlers} = fixture();
    assert.equal((await run('save',null,{key:'world'})).status,401);
    assert.equal((await run('save','A',{key:'world',playFabId:'B'})).status,403);
    assert.equal((await run('save','A',{key:'__proto__'})).status,400);
    assert.deepEqual((await run('self','A')).data,{saved:null});
    assert.deepEqual((await run('save','A',{key:'fire:fire'})).data,{saved:{key:'fire:fire'}});
    assert.deepEqual((await run('save','A',{key:'magician'})).data,{saved:{key:'magician'}});
    assert.deepEqual([...profiles], [['A',{key:'magician'}]]);
    assert.deepEqual([...handlers.keys()], ['/api/four-elements/self','/api/four-elements/save']);
});

test('authorized profile reads compare two saved types, with no consent flag or store state needed', async () => {
    const {run,deps,profiles} = fixture();
    await run('save','A',{key:'fire:fire'});
    assert.equal(await getProfileArcanaCompatibility(deps,'A','B'),null);
    assert.equal(await getProfileArcanaCompatibility(deps,'A','A'),null);
    await run('save','B',{key:'water:water'});
    const { title, mark, reason, advice, ...rest } = await getProfileArcanaCompatibility(deps,'A','B');
    assert.equal(title,'星');
    assert.equal(mark,'△');
    assert.ok(reason && advice);
    assert.deepEqual(rest,{});
    assert.equal(await getProfileArcanaCompatibility(deps,'X','B'),null);
    assert.equal(await getProfileArcanaCompatibility(deps,'A','other/profile'),null);
    profiles.set('B',{key:'toString'});
    assert.equal(await getProfileArcanaCompatibility(deps,'A','B'),null);
});

test('Wheel faces keep distinct saved keys and show the corresponding profile title', async () => {
    const {run,deps} = fixture();
    await run('save','A',{key:'earth:earth'});
    for(const [key,label] of [['fire:wind','運命の輪〈面舵〉'],['wind:fire','運命の輪〈取舵〉']]) {
        await run('save','B',{key});
        assert.deepEqual((await run('self','B')).data.saved,{key});
        assert.equal((await getProfileArcanaCompatibility(deps,'A','B')).title,label);
    }
});


test('failed storage write leaves previous result intact; retry replaces it safely', async () => {
    const {run,rejectSave} = fixture();
    await run('save','A',{key:'fool'});
    rejectSave(true);
    assert.equal((await run('save','A',{key:'world'})).status,500);
    assert.deepEqual((await run('self','A')).data,{saved:{key:'fool'}});
    rejectSave(false);
    assert.equal((await run('save','A',{key:'world'})).status,200);
    assert.equal((await run('save','A',{key:'world'})).status,200);
    assert.deepEqual((await run('self','A')).data,{saved:{key:'world'}});
});

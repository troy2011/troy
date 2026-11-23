const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const TROY = 'https://troy-xetw.onrender.com';
const SITES = 'https://tarot-kingdom-online.bar-troy2011.chatgpt.site';
const CALLBACK = SITES + '/auth/troy/callback';
const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const MAX_TRACKED = 1024;
const WINDOW_MS = 60_000;
const digest = value => createHash('sha256').update(value).digest();
const good = value => typeof value === 'string' && OPAQUE.test(value);
function equal(a, b) { return typeof a === 'string' && typeof b === 'string' && timingSafeEqual(digest(a), digest(b)); }
function secret(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value); }

function registerTarotLineBridge(app, { enable, verifyIdentity, resolveLinkedLineId, bridgeKey, subjectKey, fetchImpl=fetch, now=Date.now }) {
  const enabled = enable === '1' && secret(bridgeKey) && secret(subjectKey) && !equal(bridgeKey, subjectKey);
  const accounts = new Map();
  let globalUntil = 0, globalCount = 0;
  const limited = id => {
    const at = now();
    if (!id) {
      if (globalUntil <= at) { globalCount = 0; globalUntil = at+WINDOW_MS; }
      return ++globalCount > 180;
    }
    let v = accounts.get(id);
    if (v && v.until > at) return ++v.count > 8;
    if (accounts.size >= MAX_TRACKED) {
      for (const [k, x] of accounts) if (x.until <= at) accounts.delete(k);
      if (accounts.size >= MAX_TRACKED) return true;
    }
    accounts.set(id,{count:1,until:at+WINDOW_MS});
    return false;
  };
  const base = '/api/tarot';
  const harden = (res) => res.set({
    'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY', 'X-Robots-Tag':'noindex, nofollow'
  });
  const handle = (fn) => async (req, res) => {
    harden(res);
    if (!enabled) return res.status(404).json({ error: 'not_found' });
    try { return await fn(req, res); }
    catch { return res.status(503).json({ error:'bridge_unavailable' }); }
  };
  app.get(base+'/availability', (req,res) => harden(res).json({enabled}));
  app.get(base+'/start',handle((req,res) => res.redirect(303,SITES+'/auth/troy/start')));
  app.get(base+'/authorize', handle(async (req,res) => {
    if (!good(req.query.state)) return res.status(400).send('Invalid authorization state');
    // This page only resumes the existing same-origin Firebase session. It cannot create LINE accounts.
    res.set('Referrer-Policy','strict-origin'); // Allow a real Origin on HTTPS form POST; never send the state URL.
    res.set('Content-Security-Policy', "default-src 'none'; script-src 'self' https://www.gstatic.com; connect-src 'self' https://securetoken.googleapis.com https://identitytoolkit.googleapis.com; form-action "+CALLBACK+"; base-uri 'none'; frame-ancestors 'none'");
    return res.type('html').send('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TROY LINEログイン確認</title><h1>TROYのLINEログインを確認</h1><p id="bridgeStatus" role="status">ログインを確認しています。</p><form id="bridgeForm" method="post" action="'+CALLBACK+'" hidden><input type="hidden" name="state"><input type="hidden" name="code"><button>対戦ロビーへ進む</button></form><p><a href="/">TROYへ戻る</a></p><script type="module" src="/js/tarot-line-bridge-v1.js"></script></html>');
  }));
  app.post(base+'/authorize', handle(async (req,res) => {
    if (req.get('origin') !== TROY || !req.is('application/json')) return res.status(403).json({ error:'forbidden' });
    const { state } = req.body || {};
    if (!good(state)) return res.status(400).json({ error:'invalid_state' });
    if (limited()) return res.status(429).json({error:'try_again'});
    let account;
    try { account = await verifyIdentity(req); } catch { return res.status(401).json({error:'login_required'}); }
    if (!account?.playFabId) return res.status(401).json({error:'login_required'});
    if (limited(account.playFabId)) return res.status(429).json({error:'try_again'});
    const lineId = await resolveLinkedLineId(account.playFabId);
    if (!lineId) return res.status(403).json({error:'line_required'});
    const subject = createHmac('sha256',subjectKey).update('troy-line-v1\0'+lineId).digest('base64url');
    const code = randomBytes(32).toString('base64url');
    const grant = await fetchImpl(SITES+'/auth/troy/grants', {
      method:'POST', headers:{Authorization:'Bearer '+bridgeKey,'Content-Type':'application/json'},
      body:JSON.stringify({state,codeHash:digest(code).toString('base64url'),subject}),
      signal:AbortSignal.timeout(4500), redirect:'error'
    });
    // The response body is not used; release the stream on every path.
    await grant.body?.cancel();
    if (grant.status === 409) return res.status(409).json({error:'state_used'});
    if (grant.status === 429) return res.status(429).json({error:'try_again'});
    if (grant.status !== 201) return res.status(503).json({error:'bridge_unavailable'});
    return res.json({code});
  }));
}
module.exports = { registerTarotLineBridge };

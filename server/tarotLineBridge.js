const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const TROY = 'https://troy-xetw.onrender.com';
const SITES = 'https://tarot-kingdom-online.bar-troy2011.chatgpt.site';
const CALLBACK = SITES + '/auth/troy/callback';
const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const TTL_MS = 90_000;
const CAP = 24;
const PILOT_WINDOW_MS = 60 * 60_000;
const digest = value => createHash('sha256').update(value).digest();
const good = value => typeof value === 'string' && OPAQUE.test(value);
function equal(a, b) { return typeof a === 'string' && typeof b === 'string' && timingSafeEqual(digest(a), digest(b)); }
function secret(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value); }

function registerTarotLineBridge(app, { verifyIdentity, resolveLinkedLineId, bridgeKey, subjectKey, ownerSubject, enrollmentHash, pilotUntil, now = Date.now }) {
  const deadline = typeof pilotUntil === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(pilotUntil) ? Date.parse(pilotUntil) : NaN;
  const boot = now();
  const windowOk = Number.isFinite(deadline) && deadline > boot && deadline - boot <= PILOT_WINDOW_MS;
  const enrolling = () => Number.isFinite(deadline) && deadline > boot && deadline - boot <= 24 * PILOT_WINDOW_MS && now() < deadline && secret(subjectKey) && !ownerSubject && !bridgeKey && typeof enrollmentHash === 'string' && /^[a-f0-9]{64}$/.test(enrollmentHash);
  const configured = windowOk && secret(bridgeKey) && secret(subjectKey) && !equal(bridgeKey, subjectKey) && good(ownerSubject) && !enrollmentHash;
  const enabled = () => configured && now() < deadline;
  const grants = new Map();
  const prune = time => { for (const [id, val] of grants) if (val.expiresAt <= time) grants.delete(id); };
  const base = '/api/tarot';
  const harden = (res) => res.set({
    'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY', 'X-Robots-Tag':'noindex, nofollow'
  });
  const handle = (fn) => async (req, res) => {
    harden(res);
    if (!enabled()) { grants.clear(); return res.status(404).json({ error: 'not_found' }); }
    try { return await fn(req, res); }
    catch { return res.status(503).json({ error:'bridge_unavailable' }); }
  };
  const boundSubject = async req => {
    const account = await verifyIdentity(req);
    const lineId = account && await resolveLinkedLineId(account.playFabId);
    return lineId ? createHmac('sha256', subjectKey).update('troy-line-v1\0'+lineId).digest('base64url') : null;
  };
  let enrolledSubject = null;
  app.get(base+'/enroll', (req,res) => {
    harden(res);
    if (!enrolling()) return res.status(404).end();
    res.set('Content-Security-Policy', "default-src 'none'; script-src 'self' https://www.gstatic.com; connect-src 'self' https://securetoken.googleapis.com https://identitytoolkit.googleapis.com; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    return res.type('html').send('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TROY LINE &#30331;&#37682;</title><h1>TROY LINE &#30331;&#37682;</h1><form id="enrollForm" method="post"><label>招待コード <input name="invitation" type="password" required autocomplete="off" maxlength="43"></label><button>確認する</button></form><p id="bridgeStatus" role="status"></p><output id="enrollSubject"></output><p><a href="/">TROY</a></p><script type="module" src="/js/tarot-line-bridge-v1.js"></script></html>');
  });
  app.post(base+'/enroll', async (req,res) => {
    harden(res);
    if (!enrolling()) return res.status(404).end();
    const invitation = req.body?.invitation;
    if (req.get('origin') !== TROY || !req.is('application/json') || !good(invitation) || !equal(digest(invitation).toString('hex'),enrollmentHash)) return res.status(403).json({error:'forbidden'});
    let subject;
    try { subject = await boundSubject(req); } catch { return res.status(401).json({error:'login_required'}); }
    if (!subject || !enrolling()) return res.status(403).json({error:'forbidden'});
    if (enrolledSubject && !equal(enrolledSubject,subject)) return res.status(403).json({error:'forbidden'});
    enrolledSubject = subject; // enrollment never issues a grant; restart does not enable play
    return res.json({ subject });
  });
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
    let subject;
    try { subject = await boundSubject(req); } catch { return res.status(401).json({ error:'login_required' }); }
    const code = randomBytes(32).toString('base64url');
    if (!equal(subject, ownerSubject)) return res.status(403).json({ error:'line_required' });
    if (!enabled()) return res.status(404).json({ error:'not_found' });
    const id = digest(state).toString('hex');
    const time = now();
    prune(time);
    if (grants.has(id)) return res.status(409).json({ error:'state_used' });
    if (grants.size >= CAP) return res.status(429).json({ error:'try_again' });
    grants.set(id, {codeHash:digest(code).toString('hex'), expiresAt:Math.min(time+TTL_MS,deadline)});
    return res.json({ code });
  }));
  app.post(base+'/redeem', handle(async (req,res) => {
    // Only Sites' backend can call it; browsers do not receive bridge credentials.
    if (!equal(req.get('authorization'), 'Bearer '+bridgeKey) || !req.is('application/json')) {
      return res.status(401).json({ error:'unauthorized' });
    }
    const { state, code } = req.body || {};
    if (!good(state) || !good(code)) return res.status(400).json({ error:'invalid_grant' });
    const id = digest(state).toString('hex');
    prune(now());
    const grant = grants.get(id);
    if (!grant?.codeHash || !equal(grant.codeHash,digest(code).toString('hex'))) {
      return res.status(400).json({ error:'invalid_grant' });
    }
    // Synchronous single-instance consume; retain only a tombstone until expiry.
    grants.set(id,{expiresAt:grant.expiresAt});
    return res.json({ subject:ownerSubject });
  }));
}
module.exports = { registerTarotLineBridge };

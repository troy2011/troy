import { rulePropSuits } from './rulePropMaterials.js';

// Ornamental witnesses to rule state, never a source of gameplay truth.
const files = { cut:'knife-reference', lock:'tankard', back:'whisky-spill' };
const vessels = { coin:'tankard-coin', cup:'tankard-cup', sword:'tankard-sword', wand:'tankard-wand' };
const base = new URL('../../assets/tarot-kingdom-table/rule-props/', import.meta.url);

function prop(kind, assets = base, file = files[kind]) {
  const wrapper = document.createElement('span');
  wrapper.className = 'kt-rule-prop';
  wrapper.dataset.kind = kind;
  const art = document.createElement('img');
  art.alt = '';
  art.draggable = false;
  art.src = new URL(file+'-shadow.webp', assets).href;
  wrapper.append(art);
  return wrapper;
}

function lockArt(suit, assets) {
  const art = document.createElement('img');
  art.alt = '';
  art.draggable = false;
  art.src = new URL(vessels[suit] + '-shadow.webp', assets).href;
  return art;
}

const find = (host, kind) => host.querySelector('.kt-rule-prop[data-kind="' + kind + '"]:not(.kt-rule-impact)');
// A full-size knife can overlap the card art; reserve the printed rank windows above it.
function keepCutRanksReadable(host, knife, rise = 0) {
  const box = knife.getBoundingClientRect();
  const ranks = [...host.parentElement.querySelectorAll('.kt-field-top .kt-card-rank')];
  if (!box.width || !ranks.length) { knife.style.removeProperty('clip-path'); return; }
  const coord = n => n.toFixed(2);
  const gaps = ranks.map(rank => {
    const r = rank.getBoundingClientRect();
    const x = coord(r.left - box.left - 1), y = coord(r.top - box.top - 1);
    const w = coord(r.width + 2), h = coord(r.height + 2 + rise);
    return 'M ' + x + ' ' + y + ' h ' + w + ' v ' + h + ' h -' + w + ' Z';
  }).join(' ');
  knife.style.clipPath = 'path(evenodd, "M -4096 -4096 H 4096 V 4096 H -4096 Z ' + gaps + '")';
}

const cutContactTracks = new WeakMap();
function trackCutContact(host, knife, anchor) {
  const prior = cutContactTracks.get(host);
  if (prior?.knife === knife && prior.anchor === anchor) { prior.update(); return; }
  prior?.stop();
  if (!knife || !anchor) { cutContactTracks.delete(host); return; }
  const update = () => {
    if (!anchor.isConnected || !knife.isConnected) return;
    const card = anchor.getBoundingClientRect();
    const stage = host.getBoundingClientRect();
    if (!card.width || !stage.width) return;
    knife.dataset.cutContact = '';
    knife.style.left = (card.left + card.width * .5 - stage.left) + 'px';
    knife.style.top = (card.top + card.height * .5 - stage.top) + 'px';
    keepCutRanksReadable(host, knife);
  };
  const observer = new ResizeObserver(update);
  observer.observe(host);
  observer.observe(anchor);
  anchor.addEventListener('animationend', update);
  let frame;
  const until = performance.now() + 300;
  const followEntry = now => {
    update();
    if (now < until && anchor.isConnected && knife.isConnected) frame = requestAnimationFrame(followEntry);
  };
  cutContactTracks.set(host, {knife,anchor,update,stop:() => {
    observer.disconnect();
    anchor.removeEventListener('animationend', update);
    if (frame) cancelAnimationFrame(frame);
  }});
  update();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) frame = requestAnimationFrame(followEntry);
}
function pinSettledKnife(host) {
  const node = find(host, 'cut');
  const cards = host.parentElement.querySelectorAll('.kt-field-top > .kt-card');
  trackCutContact(host, node?.dataset.leaving ? null : node, cards[Math.floor(cards.length / 2)]);
}
const gain = node => Number(getComputedStyle(node).opacity);
const running = new WeakMap();
const fade = (node, from, to, duration) => {
  running.get(node)?.cancel();
  const animation = node.animate([{opacity:from}, {opacity:to}], { duration, easing:'ease-out', fill:'backwards' });
  running.set(node, animation);
  return animation.finished.catch(() => {}).then(() => {
    if (running.get(node) !== animation) return false;
    running.delete(node);
    return true;
  });
};

const renderedHosts = new WeakSet();
export function renderRuleProps(host, round, { assets = base, motion = false, arriving = [], fieldSize, animateNew = false } = {}) {
  motion = motion && !document.hidden;
  const fadeNew = animateNew && motion && renderedHosts.has(host);
  renderedHosts.add(host);
  fieldSize ??= host.parentElement.querySelector('.kt-field-top')?.childElementCount || 0;
  const suits = rulePropSuits(round.lock);
  const vessel = suits.length === 1 ? suits[0] : '';
  const lockFile = vessels[suits[0]] || files.lock;
  const active = !['over','waiting'].includes(round.phase);
  const targets = { cut:active && !!round.cut, lock:active && suits.length > 0, back:active && !!round.back };
  for (const [kind,on] of Object.entries(targets)) {
    let node = find(host, kind);
    if (!on) {
      if (!node) continue;
      if (!motion || node.dataset.arriving) { running.get(node)?.cancel(); node.remove(); continue; }
      if (!node.dataset.leaving) {
        const from = gain(node);

        node.dataset.leaving = '1';
        node.style.opacity = '0';
        void fade(node, from, 0, 160).then(done => { if (done && node.dataset.leaving) node.remove(); });
      }
      continue;
    }
    if (node?.dataset.leaving) {
      running.get(node)?.cancel();
      node.remove();
      node = null;
    }
    if (!node) {
      node = prop(kind, assets, kind === 'lock' ? lockFile : files[kind]);
      if (arriving.includes(kind)) { node.dataset.arriving = '1'; node.style.opacity = '0'; }
      host.append(node);
      if (fadeNew && !node.dataset.arriving) void fade(node, 0, 1, 180);
    }
    node.toggleAttribute('data-wide-field', fieldSize >= 3);
    if (kind === 'lock' && node.dataset.suits !== suits.join(',')) {
      node.dataset.suits = suits.join(',');
      node.dataset.vessel = vessel || 'mixed';
      if (vessel) node.replaceChildren(lockArt(vessel, assets));
      else node.replaceChildren(...suits.map(suit => {
        const holder = document.createElement('span');
        holder.className = 'kt-lock-vessel';
        holder.dataset.vessel = suit;
        holder.append(lockArt(suit, assets));
        return holder;
      }));
    }
  }
  pinSettledKnife(host);
}

// Reveal after the causative card lands. A snapshot/rehydration never queues a reveal.
export function revealRuleProp(host, kind, { motion = false } = {}) {
  const node = find(host, kind);
  if (!node?.dataset.arriving || node.dataset.leaving) return false;
  delete node.dataset.arriving;
  if (kind === 'cut') pinSettledKnife(host);
  node.style.removeProperty('opacity');
  if (motion) void fade(node, 0, 1, 180);
  return true;
}

// Multiple eights legally sweep straight away; show a brief, fixed-position cue at the card.
export const multiCutBeatMs = 72;

export function flashRuleProp(host, anchors, onImpact, assets = base) {
  if (!anchors || document.hidden) return null;
  const rect = host.getBoundingClientRect();
  if (!rect.width) return null;
  const cards = (Array.isArray(anchors) ? anchors : [anchors])
    .filter(Boolean).map(anchor => anchor.getBoundingClientRect?.() ?? anchor).filter(card => card.width);
  if (!cards.length) return null;
  const knives = cards.map(card => {
    const impact = prop('cut', assets);
    impact.classList.add('kt-rule-impact');
    impact.dataset.cutContact = '';
    impact.toggleAttribute('data-multiple', cards.length > 1);
    impact.style.left = (card.left + card.width * .5 - rect.left) + 'px';
    impact.style.top = (card.top + card.height * .5 - rect.top) + 'px';
    return impact;
  });
  host.append(...knives);
  knives.forEach(knife => keepCutRanksReadable(host, knife, 8));
  return Promise.all(knives.map((impact, index) => {
    const delay = index * multiCutBeatMs;
    const cue = impact.animate([
      {opacity:0, translate:'0 -8px', offset:0},
      {opacity:1, translate:'0 0', offset:.21},
      {opacity:1, translate:'0 0', offset:.72},
      {opacity:0, translate:'0 0', offset:1}
    ], {delay, duration:112, easing:'linear', fill:'both'});
    const contact = setTimeout(() => {
      if (impact.isConnected && cue.playState !== 'idle') onImpact?.();
    }, delay + 24);
    return cue.finished.catch(() => {}).then(() => { clearTimeout(contact); impact.remove(); });
  }));
}

export function cancelRulePropAnimations(host, keep = false) {
  if (!keep) renderedHosts.delete(host);
  cutContactTracks.get(host)?.stop();
  cutContactTracks.delete(host);
  for (const node of host.querySelectorAll('.kt-rule-prop')) {
    running.delete(node);
    for (const animation of node.getAnimations({subtree:true})) animation.cancel();
    if (!keep || node.dataset.leaving || node.classList.contains('kt-rule-impact')) node.remove();
    else {
      delete node.dataset.arriving;
      node.style.removeProperty('opacity');
    }
  }
}

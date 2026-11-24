import { rulePropSuits } from './rulePropMaterials.js';

// Ornamental witnesses to rule state, never a source of gameplay truth.
const files = { cut:'knife-reference', lock:'tankard', back:'hourglass-reference' };
const vessels = { coin:'tankard-coin', cup:'tankard-cup', sword:'tankard-sword', wand:'tankard-wand' };
const base = new URL('../../assets/tarot-kingdom-table/rule-props/', import.meta.url);
const icons = {
  sword:'M4 16l9-9 4-4-1 5-9 9M4 12l7 7M5 16l-2 2',
  wand:'M4 18l12-12m-2-2 4 4M14 8l-4-1',
  cup:'M4 4h12v4a6 6 0 0 1-12 0zM10 14v4m-4 0h8',
  coin:'M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16ZM10 4.5l3.2 10.1-8.4-6.3h10.4l-8.4 6.3Z'
};

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

function makeSuit(suit) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.dataset.suit = suit;
  svg.setAttribute('viewBox','0 0 20 20');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d',icons[suit]);
  svg.append(path);
  return svg;
}

const find = (host, kind) => host.querySelector('.kt-rule-prop[data-kind="' + kind + '"]:not(.kt-rule-impact)');
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
    const grouped = (anchor.parentElement?.querySelectorAll('.kt-card').length ?? 0) >= 3;
    if (!card.width || !stage.width) return;
    knife.dataset.cutContact = '';
    knife.style.left = (card.left + card.width * (grouped ? .45 : .53) - stage.left) + 'px';
    knife.style.top = (card.top + card.height * .85 - stage.top) + 'px';
  };
  const observer = new ResizeObserver(update);
  observer.observe(host);
  observer.observe(anchor);
  anchor.addEventListener('animationend', update);
  cutContactTracks.set(host, {knife,anchor,update,stop:() => {
    observer.disconnect();
    anchor.removeEventListener('animationend', update);
  }});
  update();
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
  const lockFile = vessels[vessel] || files.lock;
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
      node.toggleAttribute('data-exact-emblem', !!vessel);
      const cup = new URL(lockFile + '-shadow.webp', assets).href;
      if (node.firstElementChild.src !== cup) node.firstElementChild.src = cup;
      const plaque = document.createElement('span');
      plaque.className = 'kt-rule-suits';
      plaque.append(...suits.map(makeSuit));
      node.querySelector('.kt-rule-suits')?.remove();
      node.append(plaque);
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
export function flashRuleProp(host, anchor, onAppear, assets = base) {
  if (!anchor || document.hidden) return null;
  const rect = host.getBoundingClientRect();
  const card = anchor.getBoundingClientRect?.() ?? anchor;
  if (!rect.width || !card.width) return null;
  const impact = prop('cut', assets);
  impact.classList.add('kt-rule-impact');
  impact.dataset.cutContact = '';
  impact.style.left = (card.left + card.width * .45 - rect.left) + 'px';
  impact.style.top = (card.top + card.height * .85 - rect.top) + 'px';
  host.append(impact);
  onAppear?.();
  const cue = impact.animate([
    {opacity:0,offset:0}, {opacity:1,offset:.36},
    {opacity:1,offset:.68}, {opacity:0,offset:1}
  ], {duration:500, easing:'linear', fill:'both'});
  return cue.finished.catch(() => {}).then(() => impact.remove());
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

// Ornamental witnesses to rule state, never a source of gameplay truth.
const files = { cut:'knife', lock:'tankard', back:'hourglass-settled' };
const base = new URL('../../assets/pirate-tarot/rule-props/', import.meta.url);
const icons = {
  sword:'M4 16l9-9 4-4-1 5-9 9M4 12l7 7M5 16l-2 2',
  wand:'M4 18l12-12m-2-2 4 4M14 8l-4-1',
  cup:'M4 4h12v4a6 6 0 0 1-12 0zM10 14v4m-4 0h8',
  coin:'M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 3 2 7-5-4h6l-5 4z'
};

function prop(kind, assets = base) {
  const wrapper = document.createElement('span');
  wrapper.className = 'kt-rule-prop';
  wrapper.dataset.kind = kind;
  const art = document.createElement('img');
  art.alt = '';
  art.draggable = false;
  art.src = new URL(files[kind]+'.webp', assets).href;
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

export function renderRuleProps(host, round, { assets = base } = {}) {
  const suits = (Array.isArray(round.lock) ? round.lock : [round.lock]).filter(suit => Object.hasOwn(icons, suit));
  const active = !['over','waiting'].includes(round.phase);
  const targets = { cut:active && !!round.cut, lock:active && suits.length > 0, back:active && !!round.back };
  for (const [kind,on] of Object.entries(targets)) {
    let node = host.querySelector('.kt-rule-prop[data-kind="'+kind+'"]:not(.kt-rule-impact)');
    if (!on) { node?.remove(); continue; }
    if (!node) { node = prop(kind, assets); host.append(node); }
    if (kind === 'lock' && node.dataset.suits !== suits.join(',')) {
      node.dataset.suits = suits.join(',');
      const plaque = document.createElement('span');
      plaque.className = 'kt-rule-suits';
      plaque.append(...suits.map(makeSuit));
      node.querySelector('.kt-rule-suits')?.remove();
      node.append(plaque);
    }
  }
}

// Called after the causative card lands. Restored state never calls this path.
export function animateRuleProp(host, kind, { anchor, assets = base } = {}) {
  if (kind === 'cut') {
    if (!anchor) return null;
    const rect = host.getBoundingClientRect();
    const card = anchor.getBoundingClientRect?.() ?? anchor;
    if (!rect.width || !card.width) return null;
    host.querySelector('.kt-rule-impact')?.remove();
    const impact = prop('cut', assets);
    impact.classList.add('kt-rule-impact');
    impact.style.left = (card.left + card.width * .53 - rect.left) + 'px';
    impact.style.top = (card.top + card.height * .55 - rect.top) + 'px';
    host.append(impact);
    const impactDone = impact.animate([
      { opacity:0, transform:'translate(-12%, -165%) rotate(29deg) scale(1.13)', offset:0 },
      { opacity:1, transform:'translate(-12%, -96%) rotate(10deg) scale(.98)', offset:.26 },
      { opacity:1, transform:'translate(-12%, -100%) rotate(13deg)', offset:.76 },
      { opacity:0, transform:'translate(-12%, -100%) rotate(13deg)', offset:1 }
    ], {duration:525, easing:'ease-out'});
    return impactDone.finished.catch(() => {}).finally(() => impact.remove());
  }
  const art = host.querySelector('.kt-rule-prop[data-kind="'+kind+'"] > img');
  if (!art) return null;
  for (const running of art.getAnimations()) running.cancel();
  if (kind === 'back') {
    const wrap = art.parentElement;
    wrap.querySelector('.kt-hourglass-flip')?.remove();
    const flip = art.cloneNode(false);
    flip.className = 'kt-hourglass-flip';
    flip.src = new URL('hourglass-before.webp', assets).href;
    wrap.append(flip);
    // Only the frame turns. A separate image shows the settled sand under gravity.
    return flip.decode().then(() => {
      if (!flip.isConnected) return;
      const options = { duration:475, easing:'ease-in-out' };
      const turning = flip.animate([
        { opacity:1, transform:'rotate(0deg)' },
        { opacity:1, transform:'rotate(180deg)' }
      ], options);
      const reveal = art.animate([{opacity:0},{opacity:0}], options);
      return Promise.allSettled([turning.finished, reveal.finished]);
    }).catch(() => {}).finally(() => flip.remove());
  }
  const frames = [
    {opacity:.2,transform:'translateY(-32%)'},
    {opacity:1,transform:'translateY(5%)',offset:.72},
    {opacity:1,transform:'translateY(0)'}
  ];
  return art.animate(frames,{ duration:350, easing:'ease-out' }).finished.catch(() => {});
}

export function cancelRulePropAnimations(host) {
  for (const animation of host.getAnimations({subtree:true})) animation.cancel();
  for (const node of host.querySelectorAll('.kt-rule-impact, .kt-hourglass-flip')) node.remove();
}

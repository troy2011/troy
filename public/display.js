(() => {
  const effectsLayer = document.getElementById('effects');
  const effectTypes = ['splash', 'boom', 'flare', 'ghost'];
  let lastEventAt = Date.now();
  let reconnectTimer = null;
  let stream = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const spawnEffect = (payload = {}) => {
    if (!effectsLayer) return;
    const type = String(payload.type || '').toLowerCase();
    const effectType = effectTypes.includes(type)
      ? type
      : effectTypes[Math.floor(Math.random() * effectTypes.length)];
    const xRaw = Number(payload.x);
    const yRaw = Number(payload.y);
    const x = Number.isFinite(xRaw) ? clamp(xRaw, 5, 95) : 15 + Math.random() * 70;
    const y = Number.isFinite(yRaw) ? clamp(yRaw, 5, 95) : 15 + Math.random() * 70;

    const effect = document.createElement('div');
    effect.className = `effect ${effectType}`;
    effect.style.left = `${x}%`;
    effect.style.top = `${y}%`;
    effectsLayer.appendChild(effect);

    const label = String(payload.label || '').trim();
    if (label) {
      const text = document.createElement('div');
      text.className = 'effect-label';
      text.textContent = label;
      effect.appendChild(text);
    }

    window.setTimeout(() => {
      effect.remove();
    }, 3200);
  };

  const handleEvent = (payload) => {
    if (!payload) return;
    if (payload.type === 'connected') return;
    if (payload.type === 'batch' && Array.isArray(payload.events)) {
      payload.events.forEach((event) => spawnEffect(event));
    } else {
      spawnEffect(payload);
    }
    lastEventAt = Date.now();
  };

  const connectStream = () => {
    if (stream) {
      stream.close();
      stream = null;
    }
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    stream = new EventSource('/api/display-stream');

    stream.addEventListener('open', () => {
      lastEventAt = Date.now();
    });

    stream.addEventListener('message', (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        handleEvent(payload);
      } catch (error) {
        console.warn('[display] failed to parse event', error);
      }
    });

    stream.addEventListener('error', () => {
      if (stream) {
        stream.close();
        stream = null;
      }
      reconnectTimer = window.setTimeout(connectStream, 2500);
    });
  };

  connectStream();
})();

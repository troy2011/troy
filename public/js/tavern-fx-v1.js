// Shared feel for the tavern minigames: short synthesized sounds, a light vibration, and the running win count.
// Everything stays in memory for this visit only: no storage, no network, no rewards.
(() => {
  'use strict';
  const MASTER_VOLUME = 0.32;
  // Notes in Hz: a bright tavern bell scale (D major).
  const NOTE = { D2: 73.42, D4: 293.66, A4: 440, D5: 587.33, F5: 739.99, A5: 880, D6: 1174.66, F6: 1479.98, A6: 1760 };
  // How long a flash or a pop stays on an element; matches the CSS animations in tavern-minigames-v1.css.
  const FLASH_MS = 520;
  const POP_MS = 420;

  let context = null;
  let soundOn = true;
  const wins = [0, 0];

  // Browsers only allow sound after a tap, so the audio context is made on the first one.
  function audio() {
    if (!soundOn || !window.AudioContext) return null;
    context ||= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  }

  // One plucked tone: a quick attack and a natural decay, like a struck glass or a coin.
  function tone(frequency, { at = 0, length = 0.18, volume = 1, type = 'triangle', slide = 0 } = {}) {
    const ac = audio();
    if (!ac) return;
    const start = ac.currentTime + at;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(frequency * slide, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  // A short wooden knock: filtered noise, for taps and a coin coming to rest. Longer and lower, it becomes a blast.
  function knock(volume = 0.7, { length = 0.07, pitch = 900 } = {}) {
    const ac = audio();
    if (!ac) return;
    const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * length), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = pitch;
    filter.Q.value = 1.4;
    gain.gain.value = MASTER_VOLUME * volume * 2;
    source.connect(filter).connect(gain).connect(ac.destination);
    source.start();
  }

  function vibrate(pattern) {
    if (soundOn && navigator.vibrate) navigator.vibrate(pattern);
  }

  // Restarts a CSS animation on an element by taking the attribute off and putting it back on the next frame.
  const marks = new WeakMap();
  const flashes = new Map();
  function clearFlash(glow) {
    const { zone, timer } = flashes.get(glow);
    clearTimeout(timer);
    glow.remove();
    flashes.delete(glow);
    if (![...flashes.values()].some(flash => flash.zone === zone)) {
      clearTimeout(marks.get(zone)?.['data-juice']);
      zone.removeAttribute('data-juice');
    }
  }
  function mark(node, attribute, value, ms) {
    if (!node?.isConnected) return;
    clearTimeout(marks.get(node)?.[attribute]);
    node.removeAttribute(attribute);
    void node.offsetWidth; // Forces a style pass so the same animation can play again at once.
    node.setAttribute(attribute, value);
    const timers = marks.get(node) || {};
    timers[attribute] = setTimeout(() => node.removeAttribute(attribute), ms);
    marks.set(node, timers);
  }

  window.tavernFx = {
    tap() { knock(0.6); },
    turn() { tone(NOTE.A4, { length: 0.14, volume: 0.45 }); },
    go() { tone(NOTE.D6, { length: 0.22, volume: 0.9, type: 'square' }); vibrate(40); },
    correct() { tone(NOTE.A5, { length: 0.12 }); tone(NOTE.D6, { at: 0.08, length: 0.2 }); vibrate(15); },
    // A paddle, a target or a pull that connects: a crisp knock with a bright tick on top.
    hit() { knock(0.8, { pitch: 1300 }); tone(NOTE.D6, { length: 0.06, volume: 0.3, type: 'square' }); vibrate(12); },
    // A point on the board: three rising coin notes.
    score() { [NOTE.D5, NOTE.A5, NOTE.D6].forEach((f, i) => tone(f, { at: i * 0.07, length: i === 2 ? 0.28 : 0.1, volume: 0.8 })); vibrate([18, 40, 18]); },
    // How close a timing or a guess was: 'perfect', 'close' or 'miss'. A perfect gets its own sparkle.
    grade(level) {
      if (level === 'perfect') {
        [NOTE.A5, NOTE.D6, NOTE.F6, NOTE.A6].forEach((f, i) => tone(f, { at: i * 0.06, length: i === 3 ? 0.4 : 0.1, volume: 0.75 }));
        vibrate([20, 30, 50]);
      } else if (level === 'close') this.correct();
      else tone(NOTE.D4, { length: 0.2, volume: 0.5, type: 'sine', slide: 0.8 });
    },
    // A short warning, for a coin near the edge of the deck.
    warn() { tone(NOTE.F5, { length: 0.08, volume: 0.35, type: 'square' }); },
    // The bomb going off: a long low blast and a strong shake of the phone.
    boom() { knock(1, { length: 0.45, pitch: 160 }); tone(NOTE.D2, { length: 0.5, volume: 0.9, type: 'sawtooth', slide: 0.5 }); vibrate(220); },
    // Lights one half for a moment: 'good', 'perfect' or 'bad'. Works with the sound off too, and stays still for reduced motion.
    // The glow is a separate layer laid over the half's box on screen, because many games restyle the half's own border and outline.
    flash(zone, kind) {
      if (!zone?.isConnected) return;
      mark(zone, 'data-juice', kind, FLASH_MS);
      const box = zone.getBoundingClientRect();
      const glow = document.createElement('span');
      glow.className = 'tavern-juice';
      glow.dataset.juice = kind;
      glow.setAttribute('aria-hidden', 'true');
      Object.assign(glow.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
      document.body.append(glow);
      flashes.set(glow, { zone, timer: setTimeout(() => clearFlash(glow), FLASH_MS) });
    },
    clearFlashes() {
      for (const glow of flashes.keys()) clearFlash(glow);
    },
    // Makes a number or a mark bounce once when it changes.
    pop(node) { mark(node, 'data-pop', '', POP_MS); },
    wrong() { tone(NOTE.D4, { length: 0.22, volume: 0.7, type: 'sawtooth', slide: 0.7 }); vibrate(60); },
    cue() { tone(NOTE.D5, { length: 0.26, volume: 0.6, type: 'sine' }); },
    coinRest() { knock(0.9); tone(NOTE.F5, { length: 0.1, volume: 0.25 }); },
    // A little fanfare on every result; a tie gets a plain two-note chord.
    result(winner) {
      if (winner == null) { tone(NOTE.D5, { length: 0.35, volume: 0.6 }); tone(NOTE.A4, { length: 0.35, volume: 0.5 }); return; }
      [NOTE.D5, NOTE.F5, NOTE.A5, NOTE.D6].forEach((f, i) => tone(f, { at: i * 0.09, length: i === 3 ? 0.5 : 0.16 }));
      vibrate([60, 50, 120]);
    },
    // The running count of wins for the current game, kept until the players go back to the list.
    record(winner) { if (winner === 0 || winner === 1) wins[winner]++; },
    wins: seat => wins[seat],
    resetWins() { wins[0] = 0; wins[1] = 0; },
    get soundOn() { return soundOn; },
    set soundOn(value) { soundOn = !!value; },
  };
})();

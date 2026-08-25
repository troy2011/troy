const fx = (animationName, placement = 'projectile', scale = 2) => Object.freeze({
  animationName,
  placement,
  scale
});

const sequence = (charge, impact, recover = impact, effect = recover) => Object.freeze({
  charge,
  'hit-stop': impact,
  damage: recover,
  recover,
  effect
});

export const TAROT_KINGDOM_MONSTER_MOTION_PROFILES = Object.freeze({
  'ismartal-vol1-monster-01': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('spikes_side')] }) }),
      area: Object.freeze({ effects: Object.freeze({
        charge: [fx('spikes_up', 'enemy')],
        'hit-stop': [fx('spikes_diagonal', 'area')]
      }) })
    })
  }),
  'ismartal-vol1-monster-02': Object.freeze({ entry: 'transition' }),
  'ismartal-vol1-monster-03': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ body: 'throw', effects: Object.freeze({ 'hit-stop': [fx('thrown_out')] }) })
    })
  }),
  'ismartal-vol1-monster-05': Object.freeze({
    idle: 'idle_2',
    entry: 'idle_2',
    escape: 'walk_2',
    hurt: 'idle_2',
    attacks: Object.freeze({
      single: Object.freeze({ body: 'attack_2' }),
      special: Object.freeze({
        body: sequence('throw', 'throw', 'idle_2', 'idle_2'),
        effects: Object.freeze({
          charge: [fx('appear', 'brood', 2)],
          'hit-stop': [fx('attack_2_2', 'brood', 2), fx('web_throw', 'projectile', 2)],
          damage: [fx('web_impact', 'area', 2)],
          effect: [fx('dead_2', 'brood', 2)]
        })
      })
    })
  }),
  'ismartal-vol1-monster-07': Object.freeze({ entry: 'appear' }),
  'ismartal-vol1-monster-14': Object.freeze({
    entry: 'transition_side',
    attacks: Object.freeze({
      area: Object.freeze({ body: sequence('transition_up', 'attack', 'transition_side') })
    })
  }),
  'ismartal-vol1-monster-16': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({
        'hit-stop': [fx('spittle')],
        damage: [fx('spittle_impact', 'area')]
      }) })
    })
  }),
  'ismartal-vol1-monster-18': Object.freeze({
    attacks: Object.freeze({
      area: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('attack_fx', 'area')] }) })
    })
  }),
  'ismartal-vol2-monster-02': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('projectile')] }) })
    })
  }),
  'ismartal-vol2-monster-03': Object.freeze({
    death: 'dead_air',
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('projectile')] }) })
    })
  }),
  'ismartal-vol2-monster-04': Object.freeze({
    entry: 'alert',
    escape: 'walk',
    deathSequence: Object.freeze(['death', 'dead_impact']),
    attacks: Object.freeze({
      single: Object.freeze({ body: sequence('attack', 'attack', 'blink') })
    })
  }),
  'ismartal-vol2-monster-05': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('image_m5_projectile')] }) })
    })
  }),
  'ismartal-vol2-monster-06': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ body: 'attack1', effects: Object.freeze({ 'hit-stop': [fx('image_m6a_projectile')] }) }),
      area: Object.freeze({ body: 'attack2', effects: Object.freeze({ 'hit-stop': [fx('tentacle', 'area')] }) })
    })
  }),
  'ismartal-vol2-monster-07': Object.freeze({
    entry: 'landing',
    escape: 'take_off',
    hurt: Object.freeze(['hurt', 'hit_ground']),
    attacks: Object.freeze({
      single: Object.freeze({ body: sequence(
        'roll_attack_anticipation',
        'roll_attack',
        'roll_attack_recoil',
        'tired'
      ) }),
      area: Object.freeze({
        variants: Object.freeze([
          Object.freeze({
            body: sequence('spike_attack_anticipation', 'spike_attack', 'spike_attack_recoil'),
            effects: Object.freeze({ 'hit-stop': [fx('image_m7_spike', 'area')] })
          }),
          Object.freeze({
            body: sequence('take_off', 'fall', 'landing', 'tired'),
            effects: Object.freeze({ damage: [fx('dust_fx', 'area')] })
          })
        ])
      }),
      special: Object.freeze({ body: sequence('roar_anticipation', 'roar', 'roar_recoil') })
    })
  }),
  'ismartal-vol2-monster-08': Object.freeze({
    attacks: Object.freeze({
      area: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('firebreath', 'area')] }) })
    })
  }),
  'ismartal-vol2-monster-10': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ body: sequence('attack', 'attack', 'blink') }),
      area: Object.freeze({ body: sequence('take_off', 'jump', 'fall', 'landing') })
    })
  }),
  'ismartal-vol2-monster-11': Object.freeze({
    death: 'dead_air',
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('projectile')] }) })
    })
  }),
  'ismartal-vol2-monster-12': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ body: sequence('attack', 'attack', 'blink') })
    })
  }),
  'ismartal-vol2-monster-14': Object.freeze({
    hurt: Object.freeze(['hurt', 'hit2']),
    death: Object.freeze(['death', 'dead1']),
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('image_m14_spike')] }) })
    })
  }),
  'ismartal-vol2-monster-16': Object.freeze({
    attacks: Object.freeze({
      area: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('attack_fx', 'area')] }) })
    })
  }),
  'ismartal-vol2-monster-17': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({
        charge: [fx('attack_fx', 'enemy')],
        'hit-stop': [fx('image_m17_bullet')]
      }) })
    })
  }),
  'ismartal-vol2-monster-19': Object.freeze({
    entry: 'appear',
    attacks: Object.freeze({
      single: Object.freeze({ body: sequence('attack', 'attack', 'blink') })
    })
  }),
  'ismartal-vol2-monster-20': Object.freeze({
    entry: 'appear',
    escape: 'disappear',
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('image_m20_projectile')] }) })
    })
  }),
  'ismartal-vol3-monster-01': Object.freeze({ entry: 'appear', escape: 'disappear' }),
  'ismartal-vol3-monster-02': Object.freeze({
    entry: 'appear',
    attacks: Object.freeze({
      area: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('vfx_flamer_attack', 'area')] }) })
    })
  }),
  'ismartal-vol3-monster-03': Object.freeze({
    attacks: Object.freeze({
      area: Object.freeze({ effects: Object.freeze({ charge: [fx('vfx_charge', 'enemy')] }) })
    })
  }),
  'ismartal-vol3-monster-04': Object.freeze({ slimeForms: true }),
  'ismartal-vol3-monster-05': Object.freeze({
    attacks: Object.freeze({
      area: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('vfx_lightning_bolt', 'area')] }) })
    })
  }),
  'ismartal-vol3-monster-06': Object.freeze({
    entry: 'appear',
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('vx_monster_6_attack', 'area')] }) })
    })
  }),
  'ismartal-vol3-monster-08': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({ 'hit-stop': [fx('projectile')] }) })
    })
  }),
  'ismartal-vol3-monster-10': Object.freeze({
    attacks: Object.freeze({
      single: Object.freeze({ effects: Object.freeze({
        'hit-stop': [fx('projectile')],
        damage: [fx('projectile_impact', 'area')]
      }) })
    })
  })
});

const SLIME_FORM_ANIMATIONS = Object.freeze({
  big: Object.freeze({
    idle: 'idle_2', entry: 'appear', attack: 'attack_2', hurt: 'hurt_2', death: 'death_2'
  }),
  medium: Object.freeze({
    idle: 'idle', entry: 'appear_2', attack: 'attack_2_2', hurt: 'hurt_2_2', death: 'death_2_2'
  }),
  small: Object.freeze({
    idle: 'idle_3', entry: 'appear_3', attack: 'attack_3', hurt: 'hurt_3', death: 'death_3'
  })
});

function selectVariant(value, seed = 0) {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return null;
  return value[Math.abs(Math.floor(Number(seed) || 0)) % value.length];
}

function selectPhaseValue(value, phase, seed = 0) {
  const selected = selectVariant(value, seed);
  if (!selected || typeof selected !== 'object') return selected;
  return selected[phase]
    || selected['hit-stop']
    || selected.charge
    || selected.damage
    || selected.recover
    || selected.effect
    || null;
}

function getSlimeForm({ isPet = false, petLevel = 1, hpRate = 1 } = {}) {
  if (isPet) {
    const level = Math.max(1, Math.min(50, Math.floor(Number(petLevel) || 1)));
    if (level <= 16) return 'small';
    if (level <= 33) return 'medium';
    return 'big';
  }
  const rate = Math.max(0, Math.min(1, Number(hpRate) || 0));
  if (rate > (2 / 3)) return 'big';
  if (rate > (1 / 3)) return 'medium';
  return 'small';
}

function resolveSlimeMotion(context, options) {
  const form = getSlimeForm(options);
  const animations = SLIME_FORM_ANIMATIONS[form];
  const key = context === 'escape'
    ? animations.idle
    : (context === 'attack' ? animations.attack : (animations[context] || animations.idle));
  return { animationName: key, effects: [], form };
}

function selectAttackSpec(profile, attackMode, hasSpecial, seed) {
  const attacks = profile?.attacks || {};
  const source = hasSpecial && attacks.special
    ? attacks.special
    : (attacks[attackMode] || attacks.single || null);
  if (!source) return null;
  if (!Array.isArray(source.variants)) return source;
  return selectVariant(source.variants, seed);
}

export function resolveTarotKingdomMonsterMotion(options = {}) {
  const monsterId = String(options.monsterId || '');
  const context = String(options.context || 'idle');
  const phase = String(options.phase || 'idle');
  const seed = Math.floor(Number(options.seed) || 0);
  const profile = TAROT_KINGDOM_MONSTER_MOTION_PROFILES[monsterId] || {};
  if (profile.slimeForms) return resolveSlimeMotion(context, options);

  if (context === 'attack') {
    const attackMode = String(options.attackMode || 'single') === 'area' ? 'area' : 'single';
    const attack = selectAttackSpec(profile, attackMode, options.hasSpecial === true, seed);
    const fallback = attackMode === 'area' ? 'attack2' : 'attack';
    const animationName = selectPhaseValue(attack?.body, phase, seed) || fallback;
    const effectPhase = Array.isArray(attack?.effects?.[phase])
      ? phase
      : (phase === 'damage' && Array.isArray(attack?.effects?.['hit-stop']) ? 'hit-stop' : '');
    const effects = effectPhase ? attack.effects[effectPhase] : [];
    return { animationName, effects, form: '' };
  }

  if (context === 'death' && Array.isArray(profile.deathSequence)) {
    const ratio = Math.max(0, Math.min(1, Number(options.elapsedRatio) || 0));
    const index = Math.min(profile.deathSequence.length - 1, Math.floor(ratio * profile.deathSequence.length));
    return { animationName: profile.deathSequence[index], effects: [], form: '' };
  }

  const fallback = context === 'entry'
    ? String(options.movementAnimation || 'idle')
    : (context === 'escape'
      ? String(options.movementAnimation || 'idle')
      : (['idle', 'hurt', 'death'].includes(context) ? context : 'idle'));
  return {
    animationName: selectVariant(profile[context], seed) || fallback,
    effects: [],
    form: ''
  };
}

function collectAnimationNames(value, output) {
  if (typeof value === 'string') {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectAnimationNames(entry, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.animationName === 'string') {
    output.add(value.animationName);
    return;
  }
  Object.entries(value).forEach(([key, entry]) => {
    collectAnimationNames(entry, output);
  });
}

export function auditTarotKingdomMonsterMotionAssignments() {
  const assignments = {};
  Object.entries(TAROT_KINGDOM_MONSTER_MOTION_PROFILES).forEach(([monsterId, profile]) => {
    const names = new Set();
    collectAnimationNames(profile, names);
    if (profile.slimeForms) collectAnimationNames(SLIME_FORM_ANIMATIONS, names);
    assignments[monsterId] = [...names].sort();
  });
  return assignments;
}

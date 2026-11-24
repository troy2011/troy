export const rulePropSoundBase = new URL('../../assets/tarot-kingdom-table/rule-prop-foley-v1/', import.meta.url);
export const rulePropSounds = Object.freeze(['knife','hourglass','mug-coin','mug-sword','mug-wand','mug-cup']);
const ruleSuits = new Set(['coin','sword','wand','cup']);

export function rulePropSuits(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).filter(suit => ruleSuits.has(suit)))];
}

export function rulePropSoundKey(kind, suits) {
  if (kind === 'cut') return 'knife';
  if (kind === 'back') return 'hourglass';
  const [suit] = rulePropSuits(suits);
  return kind === 'lock' && suit ? 'mug-' + suit : '';
}

import {roleRank} from './rules.js?v=suit-opposition-v1';
// The 15 display names use short, mixed foley. Stored legacy quad is an Elemental alias.
const keys = Object.freeze(['','straight','flush','fullhouse','four','world','straightflush','five','royal','highElemental']);
export const roleAccentClips = Object.freeze(['straight','flush','fullhouse','four','cannon','gun','bell','ambience']);
const presets = Object.freeze({
    straight:['straight',0.18,1], flush:['flush',0.18,1], fullhouse:['fullhouse',0.35,1], four:['four',0.18,1],
    world:['flush',0.26,0.8], straightflush:['straight',0.28,0.84], five:['four',0.26,0.82], royal:['gun',0.24,1],
    highStraight:['straight',0.18,1.22], highFlush:['flush',0.18,1.12], highFullHouse:['fullhouse',0.35,0.88],
    elemental:['four',0.30,0.93], highElemental:['flush',0.34,0.74],
    highFive:['cannon',0.25,1], highWorld:['cannon',0.29,0.91]
});
const high = Object.freeze({straight:'highStraight',flush:'highFlush',fullHouse:'highFullHouse',quad:'elemental',
    elemental:'elemental',highElemental:'highElemental',five:'highFive',world:'highWorld'});
export const roleAccentKey = role => role ? (role.high ? high[role.high] : keys[roleRank(role)]) || null : null;
export const roleAccent = role => presets[roleAccentKey(role)] || null;

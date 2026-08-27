import './tarotKingdomWeaponRules.shared.js?v=20260827-job-weapon-v1';

const rules = globalThis.TarotKingdomWeaponRules;

if (!rules) throw new Error('Tarot Kingdom weapon rules are unavailable.');

export const TAROT_KINGDOM_WEAPON_RULES_BASE_VERSION = rules.BASE_VERSION;
export const TAROT_KINGDOM_WEAPON_RULES_VERSION = rules.VERSION;
export const TAROT_KINGDOM_WEAPON_WEAKNESS_MULTIPLIER = rules.WEAKNESS_MULTIPLIER;
export const TAROT_KINGDOM_BACK_ROW_PHYSICAL_MULTIPLIER = rules.BACK_ROW_PHYSICAL_MULTIPLIER;
export const TAROT_KINGDOM_JOB_WEAPON_PROFICIENCY_MULTIPLIER = rules.JOB_PROFICIENCY_MULTIPLIER;
export const TAROT_KINGDOM_WEAPON_PROFILES = rules.PROFILES;
export const TAROT_KINGDOM_WEAPON_TAG_WEAK_FAMILIES = rules.TAG_WEAK_FAMILIES;
export const TAROT_KINGDOM_WEAPON_TAG_LABELS = rules.TAG_LABELS;
export const TAROT_KINGDOM_MONSTER_WEAPON_TAGS = rules.MONSTER_TAGS;
export const TAROT_KINGDOM_JOB_WEAPON_PROFICIENCIES = rules.JOB_PROFICIENCIES;
export const normalizeTarotKingdomWeaponRuleType = rules.normalizeWeaponType;
export const getTarotKingdomWeaponProfile = rules.getWeaponProfile;
export const normalizeTarotKingdomOffensiveWeaponSlots = rules.normalizeOffensiveWeaponSlots;
export const resolveTarotKingdomWeaponComponents = rules.resolveWeaponComponents;
export const resolveTarotKingdomWeaponFormation = rules.resolveFormation;
export const getTarotKingdomMonsterWeaponTags = rules.getMonsterTags;
export const getTarotKingdomJobWeaponProficiency = rules.getJobProficiency;
export const isTarotKingdomJobProficientWithWeapon = rules.isJobProficientWithWeapon;
export const getTarotKingdomJobProficiencyWeaponLabels = rules.getJobProficiencyWeaponLabels;
export const getTarotKingdomWeakFamiliesForTags = rules.getWeakFamiliesForTags;
export const getTarotKingdomMonsterWeakFamilies = rules.getMonsterWeakFamilies;
export const isTarotKingdomWeaponFamilyWeak = rules.isWeaponFamilyWeak;

// Everything derived from the sheet: ability scores, HP, AC, skills, spells.
// Nothing here is stored; call derive(sheet) whenever the sheet changes.

import {
  ABILITIES, SKILLS, glossary, spellById, featById, armorById, spellSlots,
  getSubclass, findFeature, listItems, t,
} from "./data.js";
import { getRace, getSubrace, getClass, getBackground, raceTraits, level as levelOf } from "./sheet.js";
import { optionName } from "./names.js";

export const mod = (score) => Math.floor((score - 10) / 2);
export const profBonus = (lvl) => 2 + Math.floor((lvl - 1) / 4);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** Iterate stored level choices: yields [level, key, value]. */
function* levelChoiceEntries(sheet) {
  for (const entry of sheet.levelLog) {
    for (const [key, value] of Object.entries(entry.choices ?? {})) yield [entry.level, key, value];
  }
}

/** Feats the character has, with the storage prefix of their follow-up choices. */
export function takenFeats(sheet) {
  const out = [];
  for (const [key, value] of Object.entries(sheet.choices)) {
    if (!key.startsWith("race:") || !Array.isArray(value)) continue;
    for (const id of value) if (featById[id]) out.push({ feat: featById[id], prefix: key, store: sheet.choices });
  }
  for (const entry of sheet.levelLog) {
    const asi = entry.choices?.asi;
    if (asi?.type === "feat" && featById[asi.featId]) {
      out.push({ feat: featById[asi.featId], prefix: "asi", store: entry.choices, level: entry.level });
    }
  }
  return out;
}

/** Subclass features gained up to the current level: [{ id, feature, level }]. */
export function subclassFeatures(sheet) {
  const cls = getClass(sheet);
  const sub = cls && getSubclass(cls.id, sheet.class.subclassId);
  if (!sub?.levels) return [];
  const out = [];
  for (const [lvl, ids] of Object.entries(sub.levels)) {
    if (Number(lvl) > levelOf(sheet)) continue;
    for (const id of ids) {
      const feature = findFeature(id, cls, sub);
      if (feature) out.push({ id, feature, level: Number(lvl) });
    }
  }
  return out;
}

/** Class features gained up to the current level, in order, without duplicates. */
export function classFeatures(sheet) {
  const cls = getClass(sheet);
  if (!cls) return [];
  const out = [];
  const seen = new Set();
  for (let lvl = 1; lvl <= levelOf(sheet); lvl += 1) {
    for (const id of cls.levels[String(lvl)]?.features ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const feature = findFeature(id, cls, null);
      if (feature) out.push({ id, feature, level: lvl });
    }
  }
  return out;
}

/** Every active effect with where its choices are stored. */
function activeEffects(sheet) {
  const lvl = levelOf(sheet);
  const out = [];
  for (const trait of raceTraits(sheet)) {
    (trait.effects ?? []).forEach((effect, i) => {
      if (effect.minLevel && effect.minLevel > lvl) return;
      out.push({ effect, pick: sheet.choices[`race:${trait.id}:${i}`], source: trait.name });
    });
  }
  for (const { id, feature, level } of subclassFeatures(sheet)) {
    (feature.effects ?? []).forEach((effect, i) => {
      out.push({ effect, pick: sheet.levelLog[level - 1]?.choices?.[`${id}:${i}`], source: feature.name });
    });
  }
  for (const { feat, prefix, store } of takenFeats(sheet)) {
    (feat.effects ?? []).forEach((effect, i) => {
      out.push({ effect, pick: store[`${prefix}:feat:${i}`], source: feat.name });
    });
  }
  return out;
}

export function abilityScores(sheet, { excludeFeats = false } = {}) {
  const scores = { ...sheet.abilities.base };
  for (const chip of sheet.abilities.bonus) if (chip.ability) scores[chip.ability] += chip.amount;
  for (const [, key, value] of levelChoiceEntries(sheet)) {
    if (key === "asi" && value?.type === "asi") {
      for (const [ab, n] of Object.entries(value.increases ?? {})) scores[ab] += n;
    }
  }
  if (!excludeFeats) {
    for (const { feat, prefix, store } of takenFeats(sheet)) {
      const inc = feat.abilityIncrease;
      if (!inc) continue;
      const ability = inc.from.length === 1 ? inc.from[0] : store[`${prefix}:feat:ability`]?.[0];
      if (ability) scores[ability] += inc.amount;
    }
  }
  const cls = getClass(sheet);
  let cap = 20;
  if (cls?.id === "barbarian" && levelOf(sheet) >= 20) {
    scores.str += 4;
    scores.con += 4;
    cap = 24;
  }
  for (const ab of ABILITIES) scores[ab] = Math.min(scores[ab], Math.max(cap, sheet.abilities.base[ab]));
  return scores;
}

export function proficientSkills(sheet) {
  const set = new Set(getBackground(sheet)?.skills ?? []);
  for (const id of sheet.choices["class:skills"] ?? []) set.add(id);
  for (const { effect, pick } of activeEffects(sheet)) {
    if (effect.type === "skillProficiency") set.add(effect.skill);
    if (effect.type === "skillChoice") for (const id of pick ?? []) if (SKILLS.includes(id)) set.add(id);
  }
  return set;
}

export function expertiseSkills(sheet) {
  const set = new Set();
  for (const [, key, value] of levelChoiceEntries(sheet)) {
    if (key.startsWith("expertise") && Array.isArray(value)) for (const id of value) set.add(id);
  }
  for (const { effect, pick } of activeEffects(sheet)) {
    if (effect.type === "skillChoice" && effect.expertise) for (const id of pick ?? []) set.add(id);
  }
  return set;
}

/** Spellcasting rules in effect: from the class, or from an Eldritch Knight / Arcane Trickster subclass. */
export function casterInfo(sheet) {
  const cls = getClass(sheet);
  if (!cls) return null;
  if (cls.spellcasting) return { ...cls.spellcasting, source: "class" };
  const sub = getSubclass(cls.id, sheet.class.subclassId);
  if (sub?.spellcasting) return { ...sub.spellcasting, source: "subclass" };
  return null;
}

export function hasSpellcasting(sheet) {
  const info = casterInfo(sheet);
  if (info && levelOf(sheet) >= (info.startLevel ?? 1) && info.progression !== "third") return true;
  if (info?.progression === "third" && levelOf(sheet) >= 3) return true;
  return activeEffects(sheet).some(({ effect }) => effect.type === "cantrip" || effect.type === "cantripChoice" || effect.type === "innateSpell");
}

export function slotRow(sheet, lvl = levelOf(sheet)) {
  const info = casterInfo(sheet);
  if (!info) return null;
  if (info.progression === "pact") {
    return { pact: true, count: spellSlots.pact.slots[lvl - 1], level: spellSlots.pact.slotLevel[lvl - 1] };
  }
  return { pact: false, slots: spellSlots[info.progression][lvl - 1] };
}

export function maxSpellLevel(sheet, lvl = levelOf(sheet)) {
  const row = slotRow(sheet, lvl);
  if (!row) return 0;
  if (row.pact) return row.level;
  let max = 0;
  row.slots.forEach((n, i) => { if (n > 0) max = i + 1; });
  return max;
}

/** How many cantrips/spells the player picks on the spell screen. */
export function spellBudget(sheet) {
  const info = casterInfo(sheet);
  const lvl = levelOf(sheet);
  if (!info) return null;
  const scores = abilityScores(sheet);
  const abilityMod = mod(scores[info.ability]);
  const fixed = info.fixedCantrips ?? [];
  const cantrips = Math.max(0, (info.cantripsKnown?.[lvl - 1] ?? 0) - fixed.length);
  let spells = 0;
  if (info.type === "known") spells = info.spellsKnown?.[lvl - 1] ?? 0;
  else if (info.preparedFormula === "cha + floor(level / 2)") spells = lvl >= (info.startLevel ?? 1) ? Math.max(1, abilityMod + Math.floor(lvl / 2)) : 0;
  else spells = Math.max(1, abilityMod + lvl);
  return {
    ...info,
    cantrips,
    spells,
    fixedCantrips: fixed,
    maxLevel: maxSpellLevel(sheet),
    list: info.list,
  };
}

/** Spells granted automatically (domain, oath, circle, patron-free, racial). */
export function grantedSpells(sheet) {
  const lvl = levelOf(sheet);
  const cls = getClass(sheet);
  const sub = cls && getSubclass(cls.id, sheet.class.subclassId);
  const out = [];
  const add = (id, note) => { if (spellById[id]) out.push({ spell: spellById[id], note }); };
  for (const [at, ids] of Object.entries(sub?.bonusSpells ?? {})) {
    if (Number(at) <= lvl) ids.forEach((id) => add(id, sub.name));
  }
  if (sub?.terrainSpells) {
    const terrain = sheet.levelLog.map((e) => e.choices?.circleLand?.[0]).find(Boolean);
    for (const [at, ids] of Object.entries(sub.terrainSpells[terrain] ?? {})) {
      if (Number(at) <= lvl) ids.forEach((id) => add(id, sub.name));
    }
  }
  for (const { effect, pick, source } of activeEffects(sheet)) {
    if (effect.type === "cantrip" || effect.type === "innateSpell") add(effect.spell, source);
    if (effect.type === "cantripChoice") (pick ?? []).forEach((id) => add(id, source));
  }
  for (const id of spellBudget(sheet)?.fixedCantrips ?? []) add(id, null);
  return out;
}

/** Spells the player may pick from on the spell screen. */
export function spellChoicePool(sheet) {
  const budget = spellBudget(sheet);
  if (!budget) return { cantrips: [], spells: [] };
  const cls = getClass(sheet);
  const sub = cls && getSubclass(cls.id, sheet.class.subclassId);
  const expanded = new Set();
  for (const [at, ids] of Object.entries(sub?.expandedSpells ?? {})) {
    if (Number(at) <= levelOf(sheet)) ids.forEach((id) => expanded.add(id));
  }
  const all = Object.values(spellById);
  const onList = (s) => s.classes.includes(budget.list) || expanded.has(s.id);
  return {
    cantrips: all.filter((s) => s.level === 0 && onList(s)),
    spells: all.filter((s) => s.level > 0 && s.level <= budget.maxLevel && onList(s)),
  };
}

function armorClass(sheet, scores) {
  const dex = mod(scores.dex);
  const cls = getClass(sheet);
  const armor = armorById[sheet.equipment.armorId];
  const shield = sheet.equipment.shield ? 2 : 0;
  const style = sheet.levelLog.flatMap((e) => [e.choices?.fightingStyle, e.choices?.fightingStyle2]).flat().filter(Boolean);
  if (armor) {
    const dexPart = armor.ac.dexMax === null ? dex : Math.min(dex, armor.ac.dexMax);
    return armor.ac.base + dexPart + shield + (style.includes("defense") ? 1 : 0);
  }
  const options = [10 + dex + shield];
  const features = classFeatures(sheet).map((f) => f.id);
  if (features.includes("unarmored_defense_con")) options.push(10 + dex + mod(scores.con) + shield);
  if (features.includes("unarmored_defense_wis") && !shield) options.push(10 + dex + mod(scores.wis));
  if (subclassFeatures(sheet).some((f) => f.id === "draconic_resilience")) options.push(13 + dex + shield);
  return Math.max(...options);
}

function hitPoints(sheet, scores) {
  const cls = getClass(sheet);
  if (!cls) return 0;
  const lvl = levelOf(sheet);
  const con = mod(scores.con);
  let hp = Math.max(1, cls.hitDie + con);
  for (let i = 2; i <= lvl; i += 1) hp += Math.max(1, Math.floor(cls.hitDie / 2) + 1 + con);
  for (const { effect } of activeEffects(sheet)) if (effect.type === "hpPerLevel") hp += effect.value * lvl;
  return hp;
}

function speed(sheet) {
  const race = getRace(sheet);
  let value = sheet.race.custom?.speed ?? race?.speed ?? 30;
  for (const { effect } of activeEffects(sheet)) if (effect.type === "speed") value = Math.max(value, effect.value);
  const cls = getClass(sheet);
  const lvl = levelOf(sheet);
  const armor = armorById[sheet.equipment.armorId];
  if (cls?.id === "barbarian" && lvl >= 5 && armor?.category !== "heavy") value += 10;
  if (cls?.id === "monk" && !armor && !sheet.equipment.shield) value += cls.scaling.unarmoredMovement.values[lvl - 1];
  return value;
}

function savingThrows(sheet) {
  const cls = getClass(sheet);
  const set = new Set(cls?.saves ?? []);
  const lvl = levelOf(sheet);
  if (cls?.id === "monk" && lvl >= 14) ABILITIES.forEach((a) => set.add(a));
  if (cls?.id === "rogue" && lvl >= 15) set.add("wis");
  if (subclassFeatures(sheet).some((f) => f.id === "iron_mind")) set.add("wis");
  for (const { feat, prefix, store } of takenFeats(sheet)) {
    if (feat.id === "resilient") {
      const ab = store[`${prefix}:feat:ability`]?.[0];
      if (ab) set.add(ab);
    }
  }
  return set;
}

function languages(sheet) {
  const race = getRace(sheet);
  const sub = getSubrace(sheet);
  const cls = getClass(sheet);
  const set = new Set([...(race?.languages?.fixed ?? []), ...(sub?.languages?.fixed ?? [])]);
  if (sheet.race.custom) set.add("common");
  for (const id of sheet.choices["race:languages"] ?? []) set.add(id);
  for (const id of sheet.choices["background:languages"] ?? []) set.add(id);
  for (const id of cls?.extraLanguages ?? []) set.add(id);
  const subIds = subclassFeatures(sheet).map((f) => f.id);
  if (subIds.includes("dragon_ancestor")) set.add("draconic");
  if (subIds.includes("wind_speaker")) set.add("primordial");
  if (subIds.includes("giant_power")) set.add("giant");
  return [...set];
}

/** Picked option names for list-based choices, for the features summary. */
function pickedOptions(sheet) {
  const out = [];
  const lists = ["fighting_styles", "metamagic", "maneuvers", "arcane_shots", "elemental_disciplines", "invocations"];
  const byId = Object.fromEntries(lists.flatMap((l) => listItems(l).map((i) => [i.id, i])));
  for (const [, key, value] of levelChoiceEntries(sheet)) {
    if (!Array.isArray(value)) continue;
    for (const id of value) {
      if (byId[id]) out.push({ item: byId[id], key });
    }
  }
  // Features whose choice is a plain option list (pact boon, totem spirit, hunter's prey, ...).
  const cls = getClass(sheet);
  const sub = cls && getSubclass(cls.id, sheet.class.subclassId);
  for (const entry of sheet.levelLog) {
    const ids = [...(cls?.levels[String(entry.level)]?.features ?? []), ...(sub?.levels?.[String(entry.level)] ?? [])];
    for (const fid of ids) {
      const feature = findFeature(fid, cls, sub);
      if (!feature?.choice?.options) continue;
      const picked = entry.choices?.[feature.choice.key];
      if (!Array.isArray(picked) || !picked.length) continue;
      const names = picked.map((id) => optionName(id));
      out.push({
        key: feature.choice.key,
        replaces: fid,
        item: {
          name: feature.name,
          desc: { ko: names.map((n) => t(n, "ko")).join(", "), en: names.map((n) => t(n, "en")).join(", ") },
        },
      });
    }
  }
  return out;
}

/** Common features that add nothing useful to a persona description. */
export const SILENT_FEATURES = new Set(["asi", "spellcasting", "ek_spellcasting", "at_spellcasting"]);

export const ABILITY_WORDS = [
  [5, { ko: "몹시 약함", en: "very poor" }],
  [7, { ko: "약함", en: "poor" }],
  [9, { ko: "평균 이하", en: "below average" }],
  [11, { ko: "보통", en: "average" }],
  [13, { ko: "평균 이상", en: "above average" }],
  [15, { ko: "뛰어남", en: "good" }],
  [17, { ko: "탁월함", en: "excellent" }],
  [19, { ko: "비범함", en: "exceptional" }],
  [99, { ko: "전설적", en: "legendary" }],
];

export function abilityWord(score) {
  return ABILITY_WORDS.find(([max]) => score <= max)[1];
}

export function derive(sheet) {
  const lvl = levelOf(sheet);
  const scores = abilityScores(sheet);
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, mod(scores[a])]));
  const pb = profBonus(lvl);
  const profSkills = proficientSkills(sheet);
  const expert = expertiseSkills(sheet);
  const cls = getClass(sheet);
  const jack = cls?.id === "bard" && lvl >= 2;
  const skills = Object.fromEntries(SKILLS.map((id) => {
    const ab = glossary.skills[id].ability;
    const prof = profSkills.has(id);
    const exp = prof && expert.has(id);
    const bonus = mods[ab] + (exp ? pb * 2 : prof ? pb : jack ? Math.floor(pb / 2) : 0);
    return [id, { prof, expert: exp, bonus, ability: ab }];
  }));
  const saves = savingThrows(sheet);
  const effects = activeEffects(sheet);
  const darkvision = effects.reduce((m, { effect }) => (effect.type === "darkvision" ? Math.max(m, effect.range) : m), 0);
  const resistances = [...new Set(effects.filter(({ effect }) => effect.type === "resistance").map(({ effect }) => effect.damage))];
  const budget = spellBudget(sheet);
  const caster = casterInfo(sheet);
  const spellMod = caster ? mods[caster.ability] : 0;

  const weaponProfs = new Set(cls?.proficiencies?.weapons ?? []);
  const armorProfs = new Set(cls?.proficiencies?.armor ?? []);
  for (const { effect } of effects) {
    if (effect.type === "weaponProficiency") effect.weapons.forEach((w) => weaponProfs.add(w));
    if (effect.type === "armorProficiency") effect.armor.forEach((a) => armorProfs.add(a));
  }

  return {
    level: lvl,
    profBonus: pb,
    scores,
    mods,
    hp: hitPoints(sheet, scores),
    ac: armorClass(sheet, scores),
    speed: speed(sheet),
    initiative: mods.dex + (takenFeats(sheet).some(({ feat }) => feat.id === "alert") ? 5 : 0),
    darkvision,
    resistances,
    skills,
    saves: Object.fromEntries(ABILITIES.map((a) => [a, { prof: saves.has(a), bonus: mods[a] + (saves.has(a) ? pb : 0) }])),
    languages: languages(sheet),
    weaponProfs: [...weaponProfs],
    armorProfs: [...armorProfs],
    raceTraits: raceTraits(sheet),
    classFeatures: classFeatures(sheet),
    subclassFeatures: subclassFeatures(sheet),
    feats: takenFeats(sheet).map((f) => f.feat),
    pickedOptions: pickedOptions(sheet),
    background: getBackground(sheet),
    spellcasting: caster ? {
      ability: caster.ability,
      dc: 8 + pb + spellMod,
      attack: pb + spellMod,
      budget,
      slots: slotRow(sheet),
    } : null,
    granted: grantedSpells(sheet),
  };
}

export { t };

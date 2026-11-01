// Indexes over the bundled game data.
import DATA from "virtual:data";

export const glossary = DATA.glossary;
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const SKILLS = Object.keys(DATA.glossary.skills);

export const races = DATA.raceOrder.map((id) => DATA.races[id]);
export const raceById = DATA.races;

export const classes = DATA.classOrder.map((id) => DATA.classes[id]);
export const classById = DATA.classes;
export const subclassDetails = DATA.subclasses;

export const lists = DATA.lists;
export const commonFeatures = DATA.lists.common_features.features;
export const spellSlots = DATA.lists.spell_slots;

export const spells = DATA.spells;
export const spellById = Object.fromEntries(DATA.spells.map((s) => [s.id, s]));

export const backgrounds = DATA.backgrounds._meta.order.map((id) =>
  DATA.backgrounds.items.find((b) => b.id === id),
);
export const backgroundById = Object.fromEntries(DATA.backgrounds.items.map((b) => [b.id, b]));

export const feats = DATA.feats;
export const featById = Object.fromEntries(DATA.feats.map((f) => [f.id, f]));

export const equipment = DATA.equipment;
export const armorById = Object.fromEntries(DATA.equipment.armor.map((a) => [a.id, a]));
export const weaponById = Object.fromEntries(DATA.equipment.weapons.map((w) => [w.id, w]));

export const appearanceFields = DATA.appearance;

/** Pick a language from a { ko, en } object, falling back to the other one. */
export function t(text, lang = "ko") {
  if (text == null) return "";
  if (typeof text === "string") return text;
  return text[lang] ?? text[lang === "ko" ? "en" : "ko"] ?? "";
}

export const abilityName = (key, lang = "ko") => t(glossary.abilities[key], lang);
export const abilityAbbr = (key, lang = "ko") => t(glossary.abilities[key]?.abbr, lang);
export const skillName = (key, lang = "ko") => t(glossary.skills[key], lang);
export const languageName = (key, lang = "ko") => t(glossary.languages[key], lang) || key;
export const schoolName = (key, lang = "ko") => t(glossary.schools[key], lang);
export const damageName = (key, lang = "ko") => t(glossary.damageTypes[key], lang);

export function listItems(name) {
  return lists[name]?.items ?? [];
}

export function getSubclass(classId, subclassId) {
  const cls = classById[classId];
  const summary = cls?.subclasses.find((s) => s.id === subclassId);
  if (!summary) return null;
  const detail = subclassDetails[classId]?.subclasses?.[subclassId] ?? {};
  return { ...summary, ...detail };
}

/** Find a feature definition by id for a class/subclass, falling back to the common list. */
export function findFeature(id, cls, sub) {
  return sub?.features?.[id] ?? cls?.features?.[id] ?? commonFeatures[id] ?? null;
}

// Character sheet state: creation and structural edits.
// Only player choices are stored; everything derived is computed in calc.js.
import { ABILITIES, raceById, classById, backgroundById } from "./data.js";

export const SCHEMA_VERSION = 1;

export function newSheet() {
  const now = new Date().toISOString();
  return {
    meta: { schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), createdAt: now, updatedAt: now, personaId: null },
    race: { raceId: null, subraceId: null, custom: null },
    class: { classId: null, subclassId: null },
    background: { backgroundId: null, custom: null },
    abilities: {
      method: "pointBuy",
      base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
      bonus: [],
    },
    choices: {},
    levelLog: [{ level: 1, choices: {} }],
    spells: { cantrips: [], known: [], prepared: [] },
    equipment: { armorId: null, shield: false },
    profile: {
      name: "",
      appearance: {},
      personality: { traits: "", ideals: "", bonds: "", flaws: "" },
      languagesExtra: "",
      backstory: "",
      notes: "",
    },
    profileEn: null,
    options: { judgementMode: false },
  };
}

export const level = (sheet) => sheet.levelLog.length;

export function getRace(sheet) {
  return sheet.race.raceId ? raceById[sheet.race.raceId] ?? null : null;
}

export function getSubrace(sheet) {
  const race = getRace(sheet);
  return race?.subraces?.find((s) => s.id === sheet.race.subraceId) ?? null;
}

export function getClass(sheet) {
  return sheet.class.classId ? classById[sheet.class.classId] ?? null : null;
}

export function getBackground(sheet) {
  return sheet.background.backgroundId ? backgroundById[sheet.background.backgroundId] ?? null : null;
}

/** Traits from the race and subrace, with replaced parent traits removed. */
export function raceTraits(sheet) {
  if (sheet.race.custom) return sheet.race.custom.traits ?? [];
  const race = getRace(sheet);
  if (!race) return [];
  const sub = getSubrace(sheet);
  const replaced = new Set(sub?.replaces ?? []);
  return [
    ...race.traits.filter((tr) => !replaced.has(tr.id)).map((tr) => ({ ...tr, origin: "race" })),
    ...(sub?.traits ?? []).map((tr) => ({ ...tr, origin: "subrace" })),
  ];
}

/**
 * Default ability bonus chips for a race/subrace: [{ amount, ability }].
 * Players may move each chip to any ability (BG3 style), one chip per ability.
 */
export function defaultBonusChips(race, sub) {
  if (!race) return [];
  if (sub?.bonusOverride) {
    const { choose, amount } = sub.bonusOverride;
    return Array.from({ length: choose }, () => ({ amount, ability: null }));
  }
  const merged = { ...race.defaultBonus };
  for (const [ab, val] of Object.entries(sub?.defaultBonus ?? {})) merged[ab] = (merged[ab] ?? 0) + val;
  const chips = Object.entries(merged).map(([ability, amount]) => ({ amount, ability }));
  if (race.bonusChoice) {
    for (let i = 0; i < race.bonusChoice.choose; i += 1) chips.push({ amount: race.bonusChoice.amount, ability: null });
  }
  return chips.sort((a, b) => b.amount - a.amount);
}

export function setRace(sheet, raceId, subraceId = null) {
  const race = raceById[raceId];
  const sub = race?.subraces?.find((s) => s.id === subraceId) ?? (race?.subraces?.length ? race.subraces[0] : null);
  return {
    ...sheet,
    race: { raceId, subraceId: sub?.id ?? null, custom: null },
    abilities: { ...sheet.abilities, bonus: defaultBonusChips(race, sub) },
    choices: dropKeys(sheet.choices, (k) => k.startsWith("race:")),
  };
}

export function setCustomRace(sheet, custom) {
  const chips = sheet.race.custom
    ? sheet.abilities.bonus
    : [{ amount: 2, ability: null }, { amount: 1, ability: null }];
  return {
    ...sheet,
    race: { raceId: null, subraceId: null, custom },
    abilities: { ...sheet.abilities, bonus: chips },
    choices: dropKeys(sheet.choices, (k) => k.startsWith("race:")),
  };
}

export function setClass(sheet, classId) {
  if (sheet.class.classId === classId) return sheet;
  return {
    ...sheet,
    class: { classId, subclassId: null },
    levelLog: sheet.levelLog.map((entry) => ({ level: entry.level, choices: {} })),
    spells: { cantrips: [], known: [], prepared: [] },
    choices: dropKeys(sheet.choices, (k) => k.startsWith("class:")),
  };
}

export function setLevel(sheet, target) {
  const n = Math.max(1, Math.min(20, target));
  const log = sheet.levelLog.slice(0, n);
  while (log.length < n) log.push({ level: log.length + 1, choices: {} });
  const cls = getClass(sheet);
  const keepSubclass = cls && n >= cls.subclassLevel ? sheet.class.subclassId : null;
  return { ...sheet, levelLog: log, class: { ...sheet.class, subclassId: keepSubclass } };
}

export function setBackground(sheet, backgroundId) {
  return {
    ...sheet,
    background: { backgroundId, custom: null },
    choices: dropKeys(sheet.choices, (k) => k.startsWith("background:")),
  };
}

/** Read a stored choice value. Level choices live in levelLog, others in sheet.choices. */
export function getChoice(sheet, desc) {
  if (desc.key === "subclass") return sheet.class.subclassId;
  if (desc.level) return sheet.levelLog[desc.level - 1]?.choices?.[desc.key];
  return sheet.choices[desc.key];
}

export function setChoice(sheet, desc, value) {
  if (desc.key === "subclass") {
    return { ...sheet, class: { ...sheet.class, subclassId: value } };
  }
  if (desc.level) {
    const log = sheet.levelLog.map((entry) =>
      entry.level === desc.level ? { ...entry, choices: { ...entry.choices, [desc.key]: value } } : entry,
    );
    return { ...sheet, levelLog: log };
  }
  return { ...sheet, choices: { ...sheet.choices, [desc.key]: value } };
}

export function touch(sheet) {
  return { ...sheet, meta: { ...sheet.meta, updatedAt: new Date().toISOString() } };
}

function dropKeys(obj, test) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !test(k)));
}

export function cleanBase(base) {
  return Object.fromEntries(ABILITIES.map((a) => [a, Number(base[a]) || 8]));
}

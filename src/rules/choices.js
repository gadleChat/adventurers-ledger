// Collects every choice the player has to make for the current sheet.
//
// A choice descriptor looks like:
//   { key, level?, group, title, help?, kind, count, options, multi }
// kind: "pick" (choose `count` option ids), "asiOrFeat", "text", "subclass".
// Values are stored with setChoice()/getChoice() from sheet.js.

import {
  ABILITIES, SKILLS, glossary, spells, spellById, feats, featById, listItems,
  getSubclass, findFeature, t, skillName,
} from "./data.js";
import { getRace, getSubrace, getClass, getBackground, raceTraits, getChoice, level as levelOf } from "./sheet.js";
import { proficientSkills, abilityScores, maxSpellLevel, hasSpellcasting } from "./calc.js";

import { optionName, named } from "./names.js";

const plainOptions = (ids) => ids.map((id) => ({ id, name: optionName(id) }));

const skillOptions = (from) => (from ?? SKILLS).map((id) => ({ id, name: glossary.skills[id] }));

const languageOptions = () =>
  Object.entries(glossary.languages)
    .filter(([, v]) => !v.secret)
    .map(([id, v]) => ({ id, name: v }));

const spellOptions = (filter) =>
  spells.filter(filter).map((s) => ({ id: s.id, name: s.name, desc: s.summary, bg3: s.bg3, level: s.level }));

function featOptions(sheet) {
  const scores = abilityScores(sheet, { excludeFeats: true });
  const caster = hasSpellcasting(sheet);
  return feats.map((f) => {
    const req = f.requires ?? {};
    let ok = true;
    if (req.ability) {
      const checks = Object.entries(req.ability).map(([ab, min]) => scores[ab] >= min);
      ok = req.anyOf ? checks.some(Boolean) : checks.every(Boolean);
    }
    if (req.spellcasting && !caster) ok = false;
    return { id: f.id, name: f.name, desc: f.desc, bg3: f.bg3, disabled: !ok };
  });
}

/** Turn a feature's `choice` object into one or more descriptors. */
function fromFeatureChoice(sheet, choice, base, lvl) {
  const cls = getClass(sheet);
  const sub = getSubclass(sheet.class.classId, sheet.class.subclassId);
  let count = choice.count ?? 1;
  if (choice.countByLevel) count = choice.countByLevel[lvl] ?? 0;
  if (choice.countFromScaling) {
    const table = cls?.scaling?.[choice.countFromScaling] ?? sub?.scaling?.[choice.countFromScaling];
    const now = table?.values[lvl - 1] ?? 0;
    const before = lvl > 1 ? table?.values[lvl - 2] ?? 0 : 0;
    count = now - before;
  }
  if (count <= 0) return [];

  if (choice.type === "asiOrFeat") return [{ ...base, kind: "asiOrFeat", count: 1 }];
  if (choice.type === "text") return [{ ...base, kind: "text", count: 1 }];
  if (choice.type === "expertise") {
    const skills = [...proficientSkills(sheet, { before: base })].map((id) => ({ id, name: glossary.skills[id] }));
    if (cls?.proficiencies?.tools?.includes("thieves_tools")) skills.push({ id: "thieves_tools", name: optionName("thieves_tools") });
    return [{ ...base, kind: "pick", count, options: skills }];
  }
  if (choice.type === "spell") {
    return [{
      ...base, kind: "pick", count,
      options: spellOptions((s) => s.level === choice.spellLevel && s.classes.includes(choice.list)),
    }];
  }
  if (choice.type === "spellAnyList") {
    const max = Math.max(1, maxSpellLevel(sheet, lvl));
    return [{ ...base, kind: "pick", count, options: spellOptions((s) => s.level <= max && s.level > 0 || s.level === 0) }];
  }
  if (choice.type === "spellPerLevel") {
    return choice.levels.map((sl) => ({
      ...base,
      key: `${base.key}:${sl}`,
      title: named(`${t(base.title)} (${sl}레벨)`, `${t(base.title, "en")} (level ${sl})`),
      kind: "pick", count: 1,
      options: spellOptions((s) => s.level === sl && s.classes.includes(choice.list)),
    }));
  }
  if (choice.options) {
    return [{ ...base, kind: "pick", count, options: plainOptions(choice.options) }];
  }
  if (choice.list) {
    let items = listItems(choice.list);
    if (choice.only) items = items.filter((i) => choice.only.includes(i.id));
    const pact = pactBoon(sheet);
    const options = items.map((i) => {
      let disabled = false;
      if (i.classes && cls && !i.classes.includes(cls.id)) disabled = true;
      if (i.minLevel && i.minLevel > lvl) disabled = true;
      if (i.requires?.minLevel && i.requires.minLevel > lvl) disabled = true;
      if (i.requires?.pact && i.requires.pact !== pact) disabled = true;
      return { id: i.id, name: i.name, desc: i.desc, disabled };
    });
    return [{ ...base, kind: "pick", count, options, list: choice.list }];
  }
  return [];
}

/** Descriptors for effects that ask the player to pick something (skills, cantrips, tools, feats). */
function fromEffects(sheet, effects, keyPrefix, base) {
  const out = [];
  effects.forEach((e, i) => {
    const key = `${keyPrefix}:${i}`;
    if (e.type === "skillChoice") {
      out.push({
        ...base, key, kind: "pick", count: e.count, options: skillOptions(e.from),
        title: named(`기술 ${e.count}개 선택`, `Choose ${e.count} skill${e.count > 1 ? "s" : ""}`),
        orTool: e.orTool,
      });
    } else if (e.type === "cantripChoice") {
      out.push({
        ...base, key, kind: "pick", count: e.count,
        options: spellOptions((s) => s.level === 0 && s.classes.includes(e.list)),
        title: named(`소마법 선택 (${t(glossary.classes[e.list])})`, `Choose a cantrip (${t(glossary.classes[e.list], "en")})`),
      });
    } else if (e.type === "toolChoice") {
      out.push({
        ...base, key, kind: "pick", count: e.count, options: plainOptions(e.from),
        title: named("도구 선택", "Choose a tool"),
      });
    } else if (e.type === "featChoice") {
      out.push({
        ...base, key, kind: "pick", count: e.count, options: featOptions(sheet),
        title: named("특기 선택", "Choose a feat"),
      });
    }
  });
  return out;
}

export function pactBoon(sheet) {
  for (const entry of sheet.levelLog) {
    const v = entry.choices?.pactBoon;
    if (v?.length) return v[0];
  }
  return null;
}

/** Choices that come from the race, background, and class creation. */
export function creationChoices(sheet) {
  const out = [];
  const race = getRace(sheet);
  const sub = getSubrace(sheet);
  const raceGroup = named("종족", "Race");

  for (const trait of raceTraits(sheet)) {
    out.push(...fromEffects(sheet, trait.effects ?? [], `race:${trait.id}`, { group: raceGroup, source: trait.name }));
  }
  const langCount = (race?.languages?.choose ?? 0) + (sub?.languages?.choose ?? 0)
    + (raceTraits(sheet).some((tr) => tr.effects?.some((e) => e.key === "extra_language")) ? 1 : 0);
  if (langCount > 0) {
    out.push({
      key: "race:languages", group: raceGroup, kind: "pick", count: langCount, options: languageOptions(),
      title: named(`언어 ${langCount}개 선택`, `Choose ${langCount} language${langCount > 1 ? "s" : ""}`),
    });
  }
  // Variant human / feats chosen at creation can have their own sub-choices.
  for (const desc of [...out]) {
    if (desc.options === undefined) continue;
    const picked = getChoice(sheet, desc) ?? [];
    if (desc.title?.en === "Choose a feat") {
      for (const featId of picked) out.push(...featFollowUps(sheet, featId, { key: desc.key, group: raceGroup }));
    }
  }

  const bg = getBackground(sheet);
  if (bg?.languages?.choose) {
    out.push({
      key: "background:languages", group: named("배경", "Background"), kind: "pick",
      count: bg.languages.choose, options: languageOptions(),
      title: named(`언어 ${bg.languages.choose}개 선택`, `Choose ${bg.languages.choose} language(s)`),
    });
  }

  const cls = getClass(sheet);
  if (cls) {
    const bgSkills = new Set(bg?.skills ?? []);
    out.push({
      key: "class:skills", group: named("직업", "Class"), kind: "pick", count: cls.skillChoice.count,
      options: skillOptions(cls.skillChoice.from).map((o) => ({ ...o, disabled: bgSkills.has(o.id), note: bgSkills.has(o.id) ? named("배경에서 이미 숙련", "Already from background") : null })),
      title: named(`직업 기술 ${cls.skillChoice.count}개 선택`, `Choose ${cls.skillChoice.count} class skills`),
    });
  }
  return out;
}

/** Extra choices created by picking a feat (ability score pick, feat's own choice, effects). */
function featFollowUps(sheet, featId, { key, group, level }) {
  const feat = featById[featId];
  if (!feat) return [];
  const out = [];
  const base = { group, level, source: feat.name };
  if (feat.abilityIncrease && feat.abilityIncrease.from.length > 1) {
    out.push({
      ...base, key: `${key}:feat:ability`, kind: "pick", count: 1,
      options: feat.abilityIncrease.from.map((id) => ({ id, name: glossary.abilities[id] })),
      title: named(`${t(feat.name)}: 능력치 선택`, `${t(feat.name, "en")}: choose an ability`),
    });
  }
  if (feat.choice) {
    out.push(...fromFeatureChoice(sheet, feat.choice, { ...base, key: `${key}:feat:choice`, title: feat.name }, level ?? levelOf(sheet)));
  }
  out.push(...fromEffects(sheet, feat.effects ?? [], `${key}:feat`, base));
  return out;
}

/** Choices that come from gaining class level `lvl`. */
export function levelChoices(sheet, lvl) {
  const cls = getClass(sheet);
  if (!cls) return [];
  const out = [];
  const group = named(`${lvl}레벨`, `Level ${lvl}`);
  const entry = cls.levels[String(lvl)] ?? { features: [] };

  if (lvl === cls.subclassLevel) {
    out.push({
      key: "subclass", level: lvl, group, kind: "subclass", count: 1,
      title: cls.subclassTitle,
      options: cls.subclasses.map((s) => ({ id: s.id, name: s.name, desc: s.summary, source: s.source })),
    });
  }

  const sub = getSubclass(cls.id, sheet.class.subclassId);
  const seen = new Map();
  const featureIds = [...entry.features, ...(sub?.levels?.[String(lvl)] ?? [])];
  for (const fid of featureIds) {
    const feature = findFeature(fid, cls, sub);
    if (!feature) continue;
    const occurrence = seen.get(fid) ?? 0;
    seen.set(fid, occurrence + 1);
    const key = feature.choice?.key ? `${feature.choice.key}${occurrence ? `:${occurrence}` : ""}` : fid;
    const base = { key, level: lvl, group, title: feature.name, help: feature.desc, source: feature.name };
    if (feature.choice) out.push(...fromFeatureChoice(sheet, feature.choice, base, lvl));
    if (feature.effects) out.push(...fromEffects(sheet, feature.effects, `${fid}`, { level: lvl, group, source: feature.name }));
  }

  // Follow-ups for an ASI slot used on a feat.
  const asi = sheet.levelLog[lvl - 1]?.choices?.asi;
  if (asi?.type === "feat" && asi.featId) {
    out.push(...featFollowUps(sheet, asi.featId, { key: "asi", group, level: lvl }));
  }
  return out;
}

export function allChoices(sheet) {
  const out = creationChoices(sheet);
  for (let lvl = 1; lvl <= levelOf(sheet); lvl += 1) out.push(...levelChoices(sheet, lvl));
  return out;
}

/** Is the stored value for a descriptor complete? */
export function isComplete(sheet, desc) {
  const value = getChoice(sheet, desc);
  if (desc.kind === "subclass") return Boolean(value);
  if (desc.kind === "text") return Boolean(value && String(value).trim());
  if (desc.kind === "asiOrFeat") {
    if (!value) return false;
    if (value.type === "feat") return Boolean(value.featId);
    const total = Object.values(value.increases ?? {}).reduce((a, b) => a + b, 0);
    return total === 2;
  }
  return Array.isArray(value) && value.length === desc.count;
}

export function missingCount(sheet, descs) {
  return descs.filter((d) => !isComplete(sheet, d)).length;
}

export { ABILITIES, skillName };

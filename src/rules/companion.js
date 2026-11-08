// Companion creation: asks the model to read the chat and propose a character
// using only ids from our data, then applies and validates the answer.

import {
  ABILITIES, SKILLS, races, classes, backgrounds, raceById, classById, backgroundById,
  appearanceFields, spellById, t,
} from "./data.js";
import { newSheet, setRace, setCustomRace, setClass, setLevel, setBackground, setChoice, getChoice, getClass } from "./sheet.js";
import { allChoices, isComplete, creationChoices } from "./choices.js";
import { spellBudget, spellChoicePool, abilityScores } from "./calc.js";

export const METHODS = {
  ai_full: {
    label: "AI가 전부",
    help: "종족, 직업, 능력치, 기술, 주문, 외형, 성격까지 채팅을 읽고 다 채운다. 레벨마다 고를 것 중 AI가 정하지 않은 건 무난한 걸로 자동으로 채운다.",
  },
  ai_skeleton: {
    label: "AI가 뼈대만",
    help: "종족, 직업, 레벨, 하위 직업, 배경, 외형, 성격은 AI가 채우고 능력치, 기술, 주문은 직접 1레벨부터 찍는다.",
  },
  manual: {
    label: "전부 직접",
    help: "이름만 적힌 빈 명부를 만든다. 페르소나 만들 때와 똑같이 고른다.",
  },
};

function catalog() {
  const raceLines = races.map((r) => {
    const subs = r.subraces.map((s) => `${s.id} (${t(s.name, "en")})`).join(", ");
    return `- ${r.id} (${t(r.name, "en")})${subs ? `: ${subs}` : ""}`;
  });
  const classLines = classes.map((c) => `- ${c.id} (${t(c.name, "en")}): ${c.subclasses.map((s) => `${s.id} (${t(s.name, "en")})`).join(", ")}`);
  const bgLines = backgrounds.map((b) => `- ${b.id} (${t(b.name, "en")})`);
  return [
    "RACES (race id: subrace ids)", ...raceLines, "",
    "CLASSES (class id: subclass ids)", ...classLines, "",
    "BACKGROUNDS", ...bgLines, "",
    `SKILLS: ${SKILLS.join(", ")}`,
  ].join("\n");
}

const APPEARANCE_KEYS = [...appearanceFields.map((f) => f.id), "extra"];

export function companionMessages(name, context, method, aliases = []) {
  const full = method === "ai_full";
  const schema = {
    name: "string",
    level: "integer 1-20",
    raceId: "race id from the catalog, or null if none fits",
    subraceId: "subrace id or null",
    customRace: "null, or { name, desc } in Korean if no catalog race fits (e.g. a setting-specific people)",
    classId: "class id",
    subclassId: "subclass id or null if level is below the subclass level",
    backgroundId: "background id, or null",
    customBackground: "null, or { name, desc } in Korean",
    ...(full ? {
      abilities: "{ str, dex, con, int, wis, cha } final scores 3-20 that fit what the chat shows",
      skills: "array of skill ids the character is clearly good at",
      spells: "array of spell names in English the character has used or would plausibly know (empty for non-casters)",
    } : {}),
    appearance: `object with any of: ${APPEARANCE_KEYS.join(", ")} (Korean, short phrases)`,
    personality: "{ traits, ideals, bonds, flaws } (Korean, one or two sentences each)",
    backstory: "Korean, a short paragraph based on what the chat reveals",
    notes: "Korean, anything else worth remembering (relationships, secrets, quirks). May be empty.",
    basis: "one of: known_character, from_chat, guessed",
  };
  const system = [
    "You read a roleplay chat and build a D&D 5e (2014 rules) character sheet for one of its characters, who is joining the user's party as a companion.",
    "Use ONLY ids from the catalog for race, subrace, class, subclass, background, and skills. If nothing fits the race or background, use the custom fields instead.",
    "If this is a well-known character (for example from Baldur's Gate 3 or the Forgotten Realms), follow the original for race, class, and subclass, but when the chat contradicts the original, the chat wins.",
    "Lorebook entries are the setting's own notes about this character and their world: treat them as canon and use their details (appearance, history, relationships) faithfully. When the chat shows later developments, the chat wins.",
    "Base everything on the lorebook and the chat. Where neither says anything, make modest, consistent guesses.",
    "Write all descriptive text (appearance, personality, backstory, notes, custom names) in Korean.",
    "Reply with a single JSON object and nothing else.",
    "",
    "JSON fields:",
    JSON.stringify(schema, null, 1),
    "",
    catalog(),
  ].join("\n");

  const parts = [`Character to build: ${name}`];
  if (aliases.length) parts.push(`Also called: ${aliases.join(", ")}`);
  if (context.charDesc) parts.push(`\n[Character card / setting: ${context.charName}]\n${context.charDesc}`);
  for (const l of context.lore) parts.push(`\n[Lorebook entry: ${l.title}]\n${l.content}`);
  parts.push(`\n[Chat excerpts, oldest first]\n${context.lines.join("\n")}`);
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n") },
  ];
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 응답에서 JSON을 찾지 못했다.");
  return JSON.parse(match[0]);
}

/** Pick sensible defaults for every remaining choice. Used for "AI가 전부" and tests. */
export function autoFill(sheet) {
  let s = sheet;
  for (let pass = 0; pass < 4; pass += 1) {
    for (const d of allChoices(s)) {
      if (isComplete(s, d)) continue;
      if (d.kind === "subclass") {
        s = setChoice(s, d, d.options[0].id);
      } else if (d.kind === "text") {
        s = setChoice(s, d, "-");
      } else if (d.kind === "asiOrFeat") {
        const cls = getClass(s);
        const scores = abilityScores(s);
        const order = [...(cls?.primary ?? []), "con", "dex", "wis", "str", "cha", "int"];
        const target = order.find((ab) => scores[ab] <= 18);
        s = setChoice(s, d, target ? { type: "asi", increases: { [target]: 2 } } : { type: "feat", featId: "tough" });
      } else if (d.kind === "pick") {
        const stored = getChoice(s, d);
        const current = Array.isArray(stored) ? stored : [];
        const usable = d.options.filter((o) => !o.disabled && !current.includes(o.id));
        const preferred = [...usable.filter((o) => o.bg3 !== false), ...usable.filter((o) => o.bg3 === false)];
        s = setChoice(s, d, [...current, ...preferred.map((o) => o.id)].slice(0, d.count));
      }
    }
  }
  return s;
}

function fillSpells(sheet, wanted) {
  const budget = spellBudget(sheet);
  if (!budget) return sheet;
  const pool = spellChoicePool(sheet);
  const byName = new Map(Object.values(spellById).map((s) => [t(s.name, "en").toLowerCase(), s.id]));
  for (const s of Object.values(spellById)) if (s.name.bg3En) byName.set(s.name.bg3En.toLowerCase(), s.id);
  const wantedIds = new Set((wanted ?? []).map((n) => byName.get(String(n).toLowerCase())).filter(Boolean));
  const pick = (list, count) => {
    const first = list.filter((s) => wantedIds.has(s.id));
    const rest = list.filter((s) => !wantedIds.has(s.id) && s.bg3);
    return [...first, ...rest].slice(0, count).map((s) => s.id);
  };
  return { ...sheet, spells: { ...sheet.spells, cantrips: pick(pool.cantrips, budget.cantrips), known: pick(pool.spells, budget.spells) } };
}

/** Apply the model's answer to a fresh companion sheet. Returns { sheet, warnings }. */
export function applyCompanion(name, text, method) {
  const data = parseJson(text);
  const warnings = [];
  let s = newSheet();
  s.meta.kind = "companion";
  s.meta.method = method;
  s.profile.name = name || data.name || "";

  if (data.raceId && raceById[data.raceId]) {
    const race = raceById[data.raceId];
    const sub = race.subraces.find((x) => x.id === data.subraceId);
    if (data.subraceId && !sub) warnings.push(`하위 종족 '${data.subraceId}'은(는) 목록에 없어 기본값으로 정했다.`);
    s = setRace(s, race.id, sub?.id ?? null);
  } else if (data.customRace?.name) {
    s = setCustomRace(s, { name: data.customRace.name, desc: data.customRace.desc ?? "", size: "medium", speed: 30,
      traits: data.customRace.desc ? [{ id: "custom", name: { ko: "종족 특성", en: "Racial traits" }, desc: { ko: data.customRace.desc, en: data.customRace.desc }, effects: [] }] : [] });
  } else if (data.raceId) {
    warnings.push(`종족 '${data.raceId}'은(는) 목록에 없어 비워 뒀다.`);
  }

  if (data.classId && classById[data.classId]) {
    s = setClass(s, data.classId);
    s = setLevel(s, Number(data.level) || 1);
    const cls = classById[data.classId];
    if (data.subclassId) {
      if (cls.subclasses.some((x) => x.id === data.subclassId) && s.levelLog.length >= cls.subclassLevel) {
        s = { ...s, class: { ...s.class, subclassId: data.subclassId } };
      } else {
        warnings.push(`하위 직업 '${data.subclassId}'은(는) 맞지 않아 비워 뒀다.`);
      }
    }
  } else {
    warnings.push(data.classId ? `직업 '${data.classId}'은(는) 목록에 없어 비워 뒀다.` : "AI가 직업을 정하지 않았다.");
    s = setLevel(s, Number(data.level) || 1);
  }

  if (data.backgroundId && backgroundById[data.backgroundId]) s = setBackground(s, data.backgroundId);
  else if (data.customBackground?.name) s = { ...s, background: { backgroundId: null, custom: { name: data.customBackground.name, desc: data.customBackground.desc ?? "" } } };

  const appearance = {};
  for (const key of APPEARANCE_KEYS) if (data.appearance?.[key]) appearance[key] = String(data.appearance[key]);
  s.profile = {
    ...s.profile,
    appearance,
    personality: {
      traits: data.personality?.traits ?? "",
      ideals: data.personality?.ideals ?? "",
      bonds: data.personality?.bonds ?? "",
      flaws: data.personality?.flaws ?? "",
    },
    backstory: data.backstory ?? "",
    notes: data.notes ?? "",
  };

  if (method === "ai_full") {
    if (data.abilities) {
      // Treat the model's numbers as final scores: put racial bonuses on the highest ones and back them out.
      const target = Object.fromEntries(ABILITIES.map((ab) => [ab, Math.max(3, Math.min(20, Number(data.abilities[ab]) || 10))]));
      const order = [...ABILITIES].sort((a, b) => target[b] - target[a]);
      const used = new Set();
      const keepOriginal = s.abilities.bonus.length === ABILITIES.length;
      const bonus = s.abilities.bonus.map((chip) => {
        const ab = keepOriginal && chip.ability ? chip.ability : order.find((x) => !used.has(x));
        used.add(ab);
        return { ...chip, ability: ab };
      });
      const base = { ...target };
      for (const chip of bonus) base[chip.ability] = Math.max(3, base[chip.ability] - chip.amount);
      s = { ...s, abilities: { method: "manual", base, bonus } };
    }
    const skillDesc = creationChoices(s).find((d) => d.key === "class:skills");
    if (skillDesc && Array.isArray(data.skills)) {
      const allowed = new Set(skillDesc.options.filter((o) => !o.disabled).map((o) => o.id));
      s = setChoice(s, skillDesc, data.skills.filter((id) => allowed.has(id)).slice(0, skillDesc.count));
    }
    s = autoFill(s);
    if (data.abilities) {
      // The model's numbers are the character's current scores, so back out every bonus
      // (racial, ability score improvements, feats) that autoFill may have added.
      const target = Object.fromEntries(ABILITIES.map((ab) => [ab, Math.max(3, Math.min(20, Number(data.abilities[ab]) || 10))]));
      const zero = Object.fromEntries(ABILITIES.map((ab) => [ab, 0]));
      const delta = abilityScores({ ...s, abilities: { ...s.abilities, base: zero } });
      const base = Object.fromEntries(ABILITIES.map((ab) => [ab, Math.max(3, Math.min(20, target[ab] - delta[ab]))]));
      s = { ...s, abilities: { ...s.abilities, base } };
    }
    s = fillSpells(s, data.spells);
    s.meta.autoFilled = true;
  }

  if (data.basis === "guessed") warnings.push("채팅에 정보가 적어서 AI가 많이 추측했다. 내용을 한 번 훑어봐라.");
  return { sheet: s, warnings };
}

export function blankCompanion(name) {
  const s = newSheet();
  s.meta.kind = "companion";
  s.meta.method = "manual";
  s.profile.name = name;
  return s;
}

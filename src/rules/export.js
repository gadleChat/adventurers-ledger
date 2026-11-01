// Builds the persona text that goes into RisuAI.
// English is what the model reads; Korean is shown next to it for the user.

import { glossary, spellById, appearanceFields, t, abilityName, skillName, languageName, damageName, getSubclass } from "./data.js";
import { getRace, getSubrace, getClass, getBackground, level as levelOf } from "./sheet.js";
import { abilityWord, signed, SILENT_FEATURES } from "./calc.js";

const L = {
  race: { ko: "종족", en: "Race" },
  class: { ko: "직업", en: "Class" },
  background: { ko: "배경", en: "Background" },
  level: { ko: "레벨", en: "level" },
  appearance: { ko: "외형", en: "Appearance" },
  personality: { ko: "성격", en: "Personality" },
  traits: { ko: "성격 특성", en: "Traits" },
  ideals: { ko: "이상", en: "Ideals" },
  bonds: { ko: "유대", en: "Bonds" },
  flaws: { ko: "결점", en: "Flaws" },
  backstory: { ko: "배경 이야기", en: "Backstory" },
  abilities: { ko: "능력치", en: "Abilities" },
  skills: { ko: "숙련 기술", en: "Skilled in" },
  expertise: { ko: "전문화", en: "expertise" },
  languages: { ko: "언어", en: "Languages" },
  features: { ko: "능력과 특성", en: "Abilities and Traits" },
  spells: { ko: "주문", en: "Spells" },
  cantrips: { ko: "소마법", en: "Cantrips" },
  combat: { ko: "전투 수치", en: "Game Statistics" },
  notes: { ko: "메모", en: "Notes" },
  senses: { ko: "감각", en: "Senses" },
  resist: { ko: "저항", en: "Resistances" },
};

const lbl = (key, lang) => t(L[key], lang);

function raceLine(sheet, lang) {
  if (sheet.race.custom) return sheet.race.custom.name || (lang === "ko" ? "이름 없는 종족" : "Unnamed race");
  const sub = getSubrace(sheet);
  return t(sub?.name ?? getRace(sheet)?.name, lang);
}

function classLine(sheet, lang) {
  const cls = getClass(sheet);
  if (!cls) return "";
  const sub = getSubclass(cls.id, sheet.class.subclassId);
  const base = lang === "ko" ? `${levelOf(sheet)}레벨 ${t(cls.name, lang)}` : `level ${levelOf(sheet)} ${t(cls.name, lang)}`;
  return sub ? `${base} (${t(sub.name, lang)})` : base;
}

/** User-written profile text, preferring the English translation when building English. */
function profileText(sheet, lang) {
  if (lang === "en" && sheet.profileEn) return sheet.profileEn;
  return sheet.profile;
}

function spellNames(ids, lang) {
  return ids.map((id) => spellById[id]).filter(Boolean).map((s) => t(s.name, lang)).join(", ");
}

export function buildPersonaText(sheet, d, lang = "en") {
  const judge = sheet.options.judgementMode;
  const profile = profileText(sheet, lang);
  const lines = [];
  const name = sheet.profile.name || (lang === "ko" ? "이름 없는 모험가" : "Unnamed adventurer");
  const bg = getBackground(sheet);

  lines.push(`# ${name}`);
  const who = [raceLine(sheet, lang), classLine(sheet, lang)].filter(Boolean).join(", ");
  const bgName = sheet.background.custom?.name ?? t(bg?.name, lang);
  lines.push(lang === "ko" ? `${who}. ${bgName ? `${bgName} 출신.` : ""}` : `${who}. ${bgName ? `${bgName} background.` : ""}`);
  if (sheet.meta.kind === "companion") {
    lines.push(lang === "ko" ? "{{user}}의 일행에 합류한 동료." : "A companion travelling in {{user}}'s party.");
  }

  const appearance = appearanceFields
    .map((f) => [f, (profile.appearance ?? {})[f.id]])
    .filter(([, v]) => v && String(v).trim())
    .map(([f, v]) => `- ${t(f.label, lang)}: ${v}`);
  if (profile.appearance?.extra) appearance.push(`- ${profile.appearance.extra}`);
  if (appearance.length) lines.push("", `## ${lbl("appearance", lang)}`, ...appearance);

  const p = profile.personality ?? {};
  const personality = ["traits", "ideals", "bonds", "flaws"]
    .filter((k) => p[k] && p[k].trim())
    .map((k) => `- ${lbl(k, lang)}: ${p[k].trim()}`);
  if (personality.length) lines.push("", `## ${lbl("personality", lang)}`, ...personality);

  if (profile.backstory?.trim()) lines.push("", `## ${lbl("backstory", lang)}`, profile.backstory.trim());

  lines.push("", `## ${lbl("abilities", lang)}`);
  for (const ab of Object.keys(d.scores)) {
    const word = t(abilityWord(d.scores[ab]), lang);
    lines.push(judge
      ? `- ${abilityName(ab, lang)} ${d.scores[ab]} (${signed(d.mods[ab])}), ${word}`
      : `- ${abilityName(ab, lang)}: ${word}`);
  }

  const skillList = Object.entries(d.skills)
    .filter(([, s]) => s.prof)
    .map(([id, s]) => {
      const name = skillName(id, lang);
      const extra = [s.expert ? lbl("expertise", lang) : null, judge ? signed(s.bonus) : null].filter(Boolean);
      return extra.length ? `${name} (${extra.join(", ")})` : name;
    });
  if (skillList.length) lines.push("", `${lbl("skills", lang)}: ${skillList.join(", ")}`);
  if (d.languages.length) lines.push(`${lbl("languages", lang)}: ${d.languages.map((id) => languageName(id, lang)).join(", ")}${profile.languagesExtra ? `, ${profile.languagesExtra}` : ""}`);
  const senses = [];
  if (d.darkvision) senses.push(lang === "ko" ? `암시야 ${d.darkvision}피트` : `darkvision ${d.darkvision} ft.`);
  if (senses.length) lines.push(`${lbl("senses", lang)}: ${senses.join(", ")}`);
  if (d.resistances.length) lines.push(`${lbl("resist", lang)}: ${d.resistances.map((r) => damageName(r, lang)).join(", ")}`);

  const features = [];
  for (const tr of d.raceTraits) features.push([tr.name, tr.desc]);
  if (bg) features.push([bg.feature.name, bg.feature.desc]);
  const replaced = new Set(d.pickedOptions.map((o) => o.replaces).filter(Boolean));
  const keep = ({ id }) => !SILENT_FEATURES.has(id) && !replaced.has(id);
  for (const f of d.classFeatures.filter(keep)) features.push([f.feature.name, f.feature.desc]);
  for (const f of d.subclassFeatures.filter(keep)) features.push([f.feature.name, f.feature.desc]);
  for (const feat of d.feats) features.push([feat.name, feat.desc]);
  for (const { item } of d.pickedOptions) features.push([item.name, item.desc]);
  if (features.length) {
    lines.push("", `## ${lbl("features", lang)}`);
    for (const [n, desc] of features) lines.push(`- ${t(n, lang)}: ${t(desc, lang)}`);
  }

  const known = [...sheet.spells.cantrips, ...sheet.spells.known];
  const granted = d.granted.map((g) => g.spell.id);
  const allSpells = [...new Set([...granted, ...known])].map((id) => spellById[id]).filter(Boolean);
  if (allSpells.length) {
    lines.push("", `## ${lbl("spells", lang)}`);
    const byLevel = new Map();
    for (const s of allSpells) byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s]);
    for (const [lv, list] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
      const head = lv === 0 ? lbl("cantrips", lang) : lang === "ko" ? `${lv}레벨` : `Level ${lv}`;
      lines.push(`- ${head}: ${list.map((s) => (judge ? t(s.name, lang) : `${t(s.name, lang)} (${t(s.summary, lang) || ""})`.replace(" ()", ""))).join(judge ? ", " : "; ")}`);
    }
  }

  if (judge) {
    lines.push("", `## ${lbl("combat", lang)}`);
    lines.push(lang === "ko"
      ? `- 방어도 ${d.ac}, 생명력 ${d.hp}, 우선권 ${signed(d.initiative)}, 이동 속도 ${d.speed}피트, 숙련 보너스 ${signed(d.profBonus)}`
      : `- AC ${d.ac}, HP ${d.hp}, Initiative ${signed(d.initiative)}, Speed ${d.speed} ft., Proficiency bonus ${signed(d.profBonus)}`);
    const saves = Object.entries(d.saves).map(([ab, s]) => `${t(glossary.abilities[ab].abbr, lang)} ${signed(s.bonus)}${s.prof ? "*" : ""}`);
    lines.push(`- ${lang === "ko" ? "내성" : "Saves"}: ${saves.join(", ")}`);
    if (d.spellcasting) {
      lines.push(lang === "ko"
        ? `- 주문 내성 난이도 ${d.spellcasting.dc}, 주문 공격 ${signed(d.spellcasting.attack)}`
        : `- Spell save DC ${d.spellcasting.dc}, spell attack ${signed(d.spellcasting.attack)}`);
    }
  }

  if (profile.notes?.trim()) lines.push("", `## ${lbl("notes", lang)}`, profile.notes.trim());
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Prompt asking the model to translate the user's free-text profile into English. */
export function translationMessages(sheet) {
  const payload = {
    appearance: sheet.profile.appearance,
    personality: sheet.profile.personality,
    backstory: sheet.profile.backstory,
    notes: sheet.profile.notes,
    languagesExtra: sheet.profile.languagesExtra,
  };
  return [
    {
      role: "system",
      content: "You translate a fantasy character's profile from Korean to natural English for a roleplay persona. Keep names, invented words, and tone. Return only JSON with the same keys and structure. Leave empty strings empty.",
    },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

export function parseTranslation(text, sheet) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("번역 결과에서 JSON을 찾지 못했습니다.");
  const parsed = JSON.parse(match[0]);
  return {
    ...sheet.profile,
    appearance: { ...sheet.profile.appearance, ...(parsed.appearance ?? {}) },
    personality: { ...sheet.profile.personality, ...(parsed.personality ?? {}) },
    backstory: parsed.backstory ?? sheet.profile.backstory,
    notes: parsed.notes ?? sheet.profile.notes,
    languagesExtra: parsed.languagesExtra ?? sheet.profile.languagesExtra,
  };
}

export { spellNames };

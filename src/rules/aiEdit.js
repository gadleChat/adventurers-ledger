// "Ask the AI to revise": the user picks which profile fields may change and
// describes what they want; the model returns new values only for those fields.

import { appearanceFields, t, getSubclass } from "./data.js";
import { getRace, getSubrace, getClass, getBackground, level as levelOf } from "./sheet.js";

export const EDIT_FIELDS = [
  { id: "name", label: "이름" },
  { id: "appearance", label: "외형" },
  { id: "traits", label: "성격 특성" },
  { id: "ideals", label: "이상" },
  { id: "bonds", label: "유대" },
  { id: "flaws", label: "결점" },
  { id: "backstory", label: "배경 이야기" },
  { id: "notes", label: "메모" },
];

const PERSONALITY = ["traits", "ideals", "bonds", "flaws"];

/** Current value of an editable field. Appearance is an object of sub-fields. */
export function readField(profile, id) {
  if (id === "name") return profile.name;
  if (id === "appearance") return profile.appearance ?? {};
  if (PERSONALITY.includes(id)) return profile.personality?.[id] ?? "";
  return profile[id] ?? "";
}

export function writeField(profile, id, value) {
  if (id === "name") return { ...profile, name: String(value) };
  if (id === "appearance") return { ...profile, appearance: { ...value } };
  if (PERSONALITY.includes(id)) return { ...profile, personality: { ...profile.personality, [id]: String(value) } };
  return { ...profile, [id]: String(value) };
}

export function formatField(id, value) {
  if (id !== "appearance") return String(value ?? "");
  return appearanceFields
    .map((f) => [t(f.label), value?.[f.id]])
    .concat([["그 밖", value?.extra]])
    .filter(([, v]) => v && String(v).trim())
    .map(([label, v]) => `${label}: ${v}`)
    .join("\n");
}

function identity(sheet) {
  const cls = getClass(sheet);
  const sub = cls && getSubclass(cls.id, sheet.class.subclassId);
  const race = sheet.race.custom?.name || t(getSubrace(sheet)?.name ?? getRace(sheet)?.name, "en");
  const bg = sheet.background.custom?.name || t(getBackground(sheet)?.name, "en");
  return [race, cls ? `level ${levelOf(sheet)} ${t(cls.name, "en")}` : null, t(sub?.name, "en"), bg ? `${bg} background` : null]
    .filter(Boolean).join(", ");
}

export function editMessages(sheet, fields, request) {
  const current = Object.fromEntries(fields.map((id) => [id, readField(sheet.profile, id)]));
  const context = Object.fromEntries(
    ["name", "appearance", ...PERSONALITY, "backstory", "notes"]
      .filter((id) => !fields.includes(id))
      .map((id) => [id, readField(sheet.profile, id)]),
  );
  return [
    {
      role: "system",
      content: [
        "You revise a fantasy roleplay character's profile on request.",
        "Change ONLY the fields listed under 'editable'. Keep everything else consistent with the unchanged fields and the character's identity.",
        "Write in Korean, matching the existing tone. Keep the same JSON shape for each field (the appearance field is an object of short phrases).",
        "Reply with a single JSON object whose keys are the edited field ids, and nothing else.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({ identity: identity(sheet), editable: current, unchanged: context, request }, null, 1),
    },
  ];
}

/** Parse the model's answer into [{ id, before, after }] for the allowed fields only. */
export function parseEdit(text, sheet, fields) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 응답에서 JSON을 찾지 못했다.");
  const data = JSON.parse(match[0]);
  return fields
    .filter((id) => data[id] !== undefined)
    .map((id) => {
      let after = data[id];
      if (id === "appearance" && typeof after !== "object") after = { ...readField(sheet.profile, id), extra: String(after) };
      return { id, before: readField(sheet.profile, id), after };
    })
    .filter((c) => formatField(c.id, c.before) !== formatField(c.id, c.after));
}

const HISTORY_LIMIT = 5;

/** Apply accepted changes, remembering the previous profile so it can be undone. */
export function applyEdits(sheet, changes) {
  if (!changes.length) return sheet;
  let profile = sheet.profile;
  for (const c of changes) profile = writeField(profile, c.id, c.after);
  const history = [{ at: new Date().toISOString(), profile: sheet.profile }, ...(sheet.history ?? [])].slice(0, HISTORY_LIMIT);
  return { ...sheet, profile, profileEn: null, history };
}

export function undoEdit(sheet) {
  const [last, ...rest] = sheet.history ?? [];
  if (!last) return sheet;
  return { ...sheet, profile: last.profile, profileEn: null, history: rest };
}

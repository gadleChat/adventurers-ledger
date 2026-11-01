// Tests companion creation and AI edits against canned model responses.
// Usage: node tools/companion-test.mjs

import assert from "node:assert/strict";
import { loadRules } from "./bundle-rules.mjs";

const rules = await loadRules(`
export { applyCompanion, companionMessages, blankCompanion } from "./src/rules/companion.js";
export { editMessages, parseEdit, applyEdits, undoEdit } from "./src/rules/aiEdit.js";
export { allChoices, isComplete } from "./src/rules/choices.js";
export { derive, spellBudget } from "./src/rules/calc.js";
export { buildPersonaText } from "./src/rules/export.js";
`);

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
};

// 1. A well-formed answer for a known character, full mode.
const gale = JSON.stringify({
  name: "Gale", level: 5, raceId: "human", subraceId: "standard_human", classId: "wizard", subclassId: "evocation",
  backgroundId: "sage", abilities: { str: 8, dex: 13, con: 14, int: 18, wis: 12, cha: 14 },
  skills: ["arcana", "insight", "history"], spells: ["Magic Missile", "Fireball", "Mage Armour", "Fire Bolt", "Shield"],
  appearance: { hair: "어깨까지 오는 갈색 머리", clothing: "보라색 로브" },
  personality: { traits: "말이 많고 재치 있다.", ideals: "지식", bonds: "미스트라", flaws: "자만심" },
  backstory: "워터딥 출신의 마법사.", notes: "", basis: "known_character",
});
check("full: known character", () => {
  const { sheet, warnings } = rules.applyCompanion("Gale", "Sure! " + gale + " Hope this helps.", "ai_full");
  assert.equal(sheet.meta.kind, "companion");
  assert.equal(sheet.class.classId, "wizard");
  assert.equal(sheet.class.subclassId, "evocation");
  assert.equal(sheet.levelLog.length, 5);
  const d = rules.derive(sheet);
  assert.equal(d.scores.int, 18, "int should land on 18");
  assert.equal(d.scores.str, 8);
  const missing = rules.allChoices(sheet).filter((x) => !rules.isComplete(sheet, x));
  assert.equal(missing.length, 0, "every choice filled: " + missing.map((m) => m.key).join(","));
  assert.ok(sheet.spells.known.includes("fireball"), "fireball kept");
  assert.ok(sheet.spells.known.includes("mage-armor"), "BG3 spelling mapped");
  assert.ok(sheet.spells.cantrips.includes("fire-bolt"));
  const budget = rules.spellBudget(sheet);
  assert.equal(sheet.spells.cantrips.length, budget.cantrips);
  assert.ok(rules.buildPersonaText(sheet, d, "en").includes("companion"));
  assert.equal(warnings.length, 0);
});

// 2. Unknown ids and a custom race, skeleton mode.
check("skeleton: custom race and bad ids", () => {
  const text = JSON.stringify({
    level: 3, raceId: null, customRace: { name: "달그림자족", desc: "달빛 아래서만 모습을 드러내는 종족." },
    classId: "ranger", subclassId: "not_a_subclass", backgroundId: "space_pirate",
    customBackground: null, appearance: { eyes: "은빛 눈" }, personality: { traits: "조용하다." }, basis: "guessed",
  });
  const { sheet, warnings } = rules.applyCompanion("Lyra", text, "ai_skeleton");
  assert.equal(sheet.race.custom.name, "달그림자족");
  assert.equal(sheet.class.classId, "ranger");
  assert.equal(sheet.class.subclassId, null);
  assert.equal(sheet.background.backgroundId, null);
  assert.equal(sheet.abilities.method, "pointBuy", "skeleton leaves abilities to the player");
  assert.ok(warnings.some((w) => w.includes("not_a_subclass")));
  assert.ok(warnings.some((w) => w.includes("추측")));
  assert.equal(sheet.spells.known.length, 0);
});

// 3. Garbage answer.
check("garbage answer throws a readable error", () => {
  assert.throws(() => rules.applyCompanion("X", "I can't do that.", "ai_full"), /JSON/);
});

// 4. Prompt contains the catalog and the known-character rule.
check("prompt", () => {
  const msgs = rules.companionMessages("Gale", { charName: "DM", charDesc: "", lore: [], lines: ["[User] hi Gale"] }, "ai_full");
  assert.ok(msgs[0].content.includes("battle_master"));
  assert.ok(msgs[0].content.includes("the chat wins"));
  assert.ok(msgs[1].content.includes("hi Gale"));
});

// 5. AI edit: only allowed fields change, diff, apply, undo.
check("ai edit", () => {
  const sheet = rules.blankCompanion("Karlach");
  sheet.profile.personality.traits = "밝다.";
  sheet.profile.backstory = "아베르누스에서 탈출했다.";
  const answer = JSON.stringify({ traits: "밝지만 분노가 끓는다.", backstory: "아베르누스에서 탈출했다.", notes: "should be ignored" });
  const changes = rules.parseEdit(answer, sheet, ["traits", "backstory"]);
  assert.equal(changes.length, 1, "unchanged backstory dropped, notes ignored");
  assert.equal(changes[0].id, "traits");
  const edited = rules.applyEdits(sheet, changes);
  assert.equal(edited.profile.personality.traits, "밝지만 분노가 끓는다.");
  assert.equal(edited.history.length, 1);
  const undone = rules.undoEdit(edited);
  assert.equal(undone.profile.personality.traits, "밝다.");
  assert.equal(undone.history.length, 0);
});

console.log(results.join("\n"));

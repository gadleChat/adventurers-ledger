// Tests for chat link mode: what gets added to requests, and dice.
// Usage: node tools/chat-test.mjs

import assert from "node:assert/strict";
import { loadRules } from "./bundle-rules.mjs";

const rules = await loadRules(`
export { applyCompanion } from "./src/rules/companion.js";
export { newSheet, setRace, setClass, setLevel, setBackground } from "./src/rules/sheet.js";
export { buildChatInjection, injectBlock, resolvePlayerSheet, recentText, CHAT_DEFAULTS } from "./src/rules/chatLink.js";
export { rollD20, rollExpression, rollableChecks, rollCheck, rollFree, rollForChat } from "./src/rules/dice.js";
export { onRequest } from "./src/chatRuntime.js";
export { live } from "./src/live.js";
`);

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
};

// A wizard who knows Fireball, and a companion called Gale (alias 게일).
let wizard = rules.setLevel(rules.setClass(rules.setBackground(rules.setRace(rules.newSheet(), "human", "standard_human"), "sage"), "wizard"), 5);
wizard.profile.name = "Ayla";
wizard.spells.known = ["fireball", "shield"];
wizard.spells.cantrips = ["fire-bolt"];
wizard.meta.personaId = "persona-1";

const galeJson = JSON.stringify({ name: "Gale", level: 5, raceId: "human", subraceId: "standard_human", classId: "wizard", subclassId: "evocation",
  backgroundId: "sage", abilities: { str: 8, dex: 13, con: 14, int: 18, wis: 12, cha: 14 }, skills: ["arcana"], spells: ["Magic Missile"],
  personality: { traits: "말이 많다." }, basis: "known_character" });
let gale = rules.applyCompanion("Gale", galeJson, "ai_full").sheet;
gale.meta.aliases = ["게일"];
const sheets = [wizard, gale];

const msgs = (...contents) => [
  { role: "system", content: "You are the narrator." },
  ...contents.map((c, i) => ({ role: i % 2 ? "assistant" : "user", content: c })),
];

await check("nothing to add -> null, messages untouched", () => {
  const m = msgs("We walk into the tavern.");
  const block = rules.buildChatInjection({ sheets, playerSheet: wizard, messages: m });
  assert.equal(block, null);
  assert.equal(rules.injectBlock(m, block), m);
});

await check("companion mentioned by alias", () => {
  const block = rules.buildChatInjection({ sheets, playerSheet: wizard, messages: msgs("게일, 저기 좀 봐.") });
  assert.ok(block.includes("[Companion sheet]"));
  assert.ok(block.includes("# Gale"));
});

await check("companion off -> not added", () => {
  const off = { ...gale, meta: { ...gale.meta, chatAuto: false } };
  const block = rules.buildChatInjection({ sheets: [wizard, off], playerSheet: wizard, messages: msgs("Gale nods.") });
  assert.equal(block, null);
});

await check("known spell by Korean name", () => {
  const block = rules.buildChatInjection({ sheets, playerSheet: wizard, messages: msgs("화염구를 던진다!") });
  assert.ok(block.includes("Fireball (3rd-level evocation"), block);
  assert.ok(!block.includes("[Companion sheet]"));
});

await check("unknown spell is ignored", () => {
  const block = rules.buildChatInjection({ sheets, playerSheet: wizard, messages: msgs("I cast Wish.") });
  assert.equal(block, null);
});

await check("companion spells count when the companion is present", () => {
  const block = rules.buildChatInjection({ sheets, playerSheet: wizard, messages: msgs("Gale casts magic missile.") });
  assert.ok(block.includes("Magic Missile ("));
});

await check("injected before last message", () => {
  const m = msgs("A", "B", "Fireball now");
  const out = rules.injectBlock(m, "X");
  assert.equal(out.length, m.length + 1);
  assert.equal(out[out.length - 2].content, "X");
  assert.equal(out[out.length - 1].content, "Fireball now");
});

await check("resolve player sheet", () => {
  assert.equal(rules.resolvePlayerSheet(sheets, "auto", "persona-1"), wizard);
  assert.equal(rules.resolvePlayerSheet(sheets, "auto", null), null);
  assert.equal(rules.resolvePlayerSheet(sheets, gale.meta.id, null), gale);
  assert.equal(rules.resolvePlayerSheet(sheets, "none", "persona-1"), null);
});

await check("dice", () => {
  const seq = [0.0, 0.999];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  assert.deepEqual(rules.rollD20("advantage", rng), { dice: [1, 20], kept: 20 });
  i = 0;
  assert.deepEqual(rules.rollD20("disadvantage", rng), { dice: [1, 20], kept: 1 });
  assert.equal(rules.rollExpression("2d6+3", () => 0.5).total, 4 + 4 + 3);
  assert.equal(rules.rollExpression("hello"), null);
  const { groups } = rules.rollableChecks(wizard);
  const arcana = groups.find((g) => g.id === "skills").items.find((x) => x.id === "skill:arcana");
  const roll = rules.rollCheck(wizard, arcana, "normal", () => 0.5);
  assert.equal(roll.total, 11 + arcana.mod);
  assert.ok(rules.rollForChat(roll).includes("Arcana check"));
  assert.ok(groups.find((g) => g.id === "common").items.some((x) => x.id === "spell-attack"));
});

await check("pending roll attached once, runtime fails safe", async () => {
  const { live } = rules;
  const roll = rules.rollCheck(wizard, { ko: "은신", en: "Stealth check", mod: 3 }, "normal", () => 0.5);
  live.set({ sheets, settings: { mode: "chat", chatSheetId: wizard.meta.id }, pendingRolls: [roll] });
  const m = msgs("I sneak past.");
  const out = await rules.onRequest(m, "model");
  assert.ok(out[out.length - 2].content.includes("Stealth check = 14"));
  assert.equal(live.get().pendingRolls.length, 0);
  assert.equal(await rules.onRequest(m, "model"), m, "nothing left to add");
  assert.equal(await rules.onRequest(m, "submodel"), m, "other request types untouched");
  live.set({ settings: { mode: "writer" }, pendingRolls: [roll] });
  assert.equal(await rules.onRequest(m, "model"), m, "writer mode untouched");
  live.set({ settings: { mode: "chat" }, pendingRolls: [], sheets: [{ meta: { kind: "companion", id: "x" }, profile: { name: "Gale" } }] });
  const plain = msgs("Gale?");
  assert.equal(await rules.onRequest(plain, "model"), plain, "a broken sheet falls back to the original request");
});

console.log(results.join("\n"));

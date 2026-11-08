// Chat link mode: builds the short reference block added to each main-model
// request. Pure functions only, so they can be tested outside RisuAI.

import { spellById, t, schoolName } from "./data.js";
import { derive } from "./calc.js";
import { buildPersonaText } from "./export.js";

const RECENT_MESSAGES = 4;
const MAX_COMPANIONS = 3;
const MAX_SPELLS = 4;
const SPELL_TEXT_CHARS = 700;

export const CHAT_DEFAULTS = {
  chatSheetId: "auto",
  chatCompanions: true,
  chatSpells: true,
  chatDice: true,
};

/** Text of the last few user/assistant messages, lower-cased, for name matching. */
export function recentText(messages, count = RECENT_MESSAGES) {
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-count)
    .map((m) => m.content)
    .join("\n")
    .toLowerCase();
}

/** Names a sheet can be called by: its name, plus comma-separated aliases. */
export function sheetNames(sheet) {
  const names = [sheet.profile?.name, ...(sheet.meta?.aliases ?? [])];
  return names.map((n) => String(n ?? "").trim()).filter((n) => n.length >= 2);
}

const mentions = (text, names) => names.some((n) => text.includes(n.toLowerCase()));

/** Companions to include: auto-include is on, and their name appears in the recent text. */
export function mentionedCompanions(sheets, text, excludeId) {
  return sheets
    .filter((s) => s.meta?.kind === "companion" && s.meta.chatAuto !== false && s.meta.id !== excludeId)
    .filter((s) => mentions(text, sheetNames(s)))
    .slice(0, MAX_COMPANIONS);
}

function knownSpellIds(sheet) {
  const d = derive(sheet);
  return [...new Set([...d.granted.map((g) => g.spell.id), ...sheet.spells.cantrips, ...sheet.spells.known])];
}

function spellAliases(spell) {
  return [spell.name?.en, spell.name?.ko, spell.name?.bg3En]
    .map((n) => String(n ?? "").trim())
    .filter((n) => n.length >= 2);
}

/** Spells the given characters know whose name appears in the recent text. */
export function mentionedSpells(sheets, text) {
  const out = new Map();
  for (const sheet of sheets) {
    for (const id of knownSpellIds(sheet)) {
      const spell = spellById[id];
      if (!spell || out.has(id)) continue;
      if (mentions(text, spellAliases(spell))) out.set(id, spell);
      if (out.size >= MAX_SPELLS) return [...out.values()];
    }
  }
  return [...out.values()];
}

const ORDINAL = ["cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export function spellReference(spell) {
  const level = spell.level === 0 ? "cantrip" : `${ORDINAL[spell.level]}-level`;
  const tags = [
    `${level} ${spell.school ? schoolName(spell.school, "en").toLowerCase() : ""}`.trim(),
    spell.castingTime,
    spell.range,
    spell.concentration ? `concentration, ${spell.duration}` : spell.duration,
  ].filter(Boolean).join("; ");
  let body = spell.desc?.en ?? spell.summary?.en ?? "";
  if (body.length > SPELL_TEXT_CHARS) body = `${body.slice(0, SPELL_TEXT_CHARS).replace(/\s+\S*$/, "")} …`;
  return `- ${t(spell.name, "en")} (${tags}): ${body.replace(/\n+/g, " ")}`;
}

/** Text describing a roll, for the model. */
export function rollForModel(roll) {
  if (roll.kind === "expr") return `${roll.who}: ${roll.labelEn} ${roll.expr} = ${roll.total} (dice ${roll.dice.join(", ")})`;
  const dice = roll.dice.length > 1 ? `d20 rolls ${roll.dice.join(" and ")}, kept ${roll.kept}` : `d20 ${roll.kept}`;
  const mod = roll.mod ? ` ${roll.mod > 0 ? "+" : "-"} ${Math.abs(roll.mod)}` : "";
  return `${roll.who}: ${roll.labelEn} = ${roll.total} (${dice}${mod}${roll.mode !== "normal" ? `, ${roll.mode}` : ""})`;
}

/**
 * Build the reference block for one request, or null when there is nothing to add.
 * `playerSheet` may be null. `pendingRolls` are rolls the player chose to attach to their next message.
 */
export function buildChatInjection({ sheets, playerSheet, messages, options = CHAT_DEFAULTS, pendingRolls = [] }) {
  const text = recentText(messages);
  const parts = [];

  const companions = options.chatCompanions ? mentionedCompanions(sheets, text, playerSheet?.meta.id) : [];
  for (const sheet of companions) {
    parts.push(`[Companion sheet]\n${buildPersonaText(sheet, derive(sheet), "en").trim()}`);
  }

  if (options.chatSpells) {
    const casters = [playerSheet, ...companions].filter(Boolean);
    const spells = mentionedSpells(casters, text);
    if (spells.length) parts.push(`[Spells mentioned (D&D 5e rules)]\n${spells.map(spellReference).join("\n")}`);
  }

  if (pendingRolls.length) {
    parts.push(`[Dice rolled by the player for this turn, already resolved; narrate the outcome to match]\n${pendingRolls.map(rollForModel).join("\n")}`);
  }

  if (!parts.length) return null;
  return [
    "<adventurers_ledger>",
    "Reference data for the story from the player's character sheets. Use it to stay consistent; do not quote or mention it.",
    "",
    parts.join("\n\n"),
    "</adventurers_ledger>",
  ].join("\n");
}

/** Insert the block as a system message just before the final message. Never throws. */
export function injectBlock(messages, block) {
  if (!block || !Array.isArray(messages) || !messages.length) return messages;
  const out = messages.slice();
  out.splice(out.length - 1, 0, { role: "system", content: block });
  return out;
}

/** The player's sheet for chat: an explicit choice, or the sheet saved to the selected persona. */
export function resolvePlayerSheet(sheets, chatSheetId, selectedPersonaId) {
  if (chatSheetId === "none") return null;
  if (chatSheetId && chatSheetId !== "auto") return sheets.find((s) => s.meta.id === chatSheetId) ?? null;
  if (!selectedPersonaId) return null;
  return sheets.find((s) => s.meta.personaId === selectedPersonaId) ?? null;
}

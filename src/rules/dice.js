// Dice for chat link mode. Rolls are made in code, never by the model.

import { ABILITIES, SKILLS, abilityName, skillName } from "./data.js";
import { derive } from "./calc.js";

const randomInt = (sides, rng) => 1 + Math.floor(rng() * sides);

/** Roll a d20 with "normal", "advantage", or "disadvantage". */
export function rollD20(mode = "normal", rng = Math.random) {
  const first = randomInt(20, rng);
  if (mode === "normal") return { dice: [first], kept: first };
  const second = randomInt(20, rng);
  const kept = mode === "advantage" ? Math.max(first, second) : Math.min(first, second);
  return { dice: [first, second], kept };
}

/** Parse and roll an expression like "2d6+3" or "d8". Returns null if it can't be read. */
export function rollExpression(expr, rng = Math.random) {
  const m = String(expr).replace(/\s+/g, "").toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  const count = Math.min(Number(m[1] || 1), 50);
  const sides = Number(m[2]);
  if (!count || sides < 2 || sides > 1000) return null;
  const dice = Array.from({ length: count }, () => randomInt(sides, rng));
  const mod = Number(m[3] || 0);
  return { dice, mod, total: dice.reduce((a, b) => a + b, 0) + mod, expr: `${count}d${sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ""}` };
}

/** Everything a character can roll a d20 for, grouped for the dice panel. */
export function rollableChecks(sheet) {
  const d = derive(sheet);
  const groups = [];
  groups.push({
    id: "skills",
    title: "기술",
    items: SKILLS.map((id) => ({
      id: `skill:${id}`, ko: skillName(id), en: `${skillName(id, "en")} check`,
      mod: d.skills[id].bonus, prof: d.skills[id].prof,
    })),
  });
  groups.push({
    id: "abilities",
    title: "능력 판정",
    items: ABILITIES.map((ab) => ({ id: `check:${ab}`, ko: `${abilityName(ab)} 판정`, en: `${abilityName(ab, "en")} check`, mod: d.mods[ab] })),
  });
  groups.push({
    id: "saves",
    title: "내성 굴림",
    items: ABILITIES.map((ab) => ({
      id: `save:${ab}`, ko: `${abilityName(ab)} 내성`, en: `${abilityName(ab, "en")} saving throw`,
      mod: d.saves[ab].bonus, prof: d.saves[ab].prof,
    })),
  });
  const other = [{ id: "initiative", ko: "우선권", en: "Initiative", mod: d.initiative }];
  if (d.spellcasting) other.push({ id: "spell-attack", ko: "주문 공격", en: "Spell attack", mod: d.spellcasting.attack });
  other.push({ id: "death-save", ko: "죽음 내성", en: "Death saving throw", mod: 0 });
  other.push({ id: "plain", ko: "그냥 d20", en: "Plain d20", mod: 0 });
  groups.unshift({ id: "common", title: "자주 쓰는 굴림", items: other });
  return { groups, d };
}

/** Make a roll record for a check. */
export function rollCheck(sheet, item, mode = "normal", rng = Math.random) {
  const { dice, kept } = rollD20(mode, rng);
  const who = sheet.profile.name || "Unnamed";
  return {
    who, label: item.ko, labelEn: item.en, mod: item.mod, mode, dice, kept,
    total: kept + item.mod,
    natural: kept === 20 ? "20" : kept === 1 ? "1" : null,
    at: Date.now(),
  };
}

const MODE_KO = { advantage: "유리함", disadvantage: "불리함" };

/** Roll record for a free dice expression like 2d6+3. */
export function rollFree(sheet, expr, rng = Math.random) {
  const r = rollExpression(expr, rng);
  if (!r) return null;
  return { kind: "expr", who: sheet?.profile.name || "Unnamed", label: "주사위", labelEn: "Roll", expr: r.expr, dice: r.dice, mod: r.mod, total: r.total, at: Date.now() };
}

/** One line for the chat log, readable by the player and the model. */
export function rollForChat(roll) {
  if (roll.kind === "expr") return `🎲 ${roll.who} · ${roll.expr}: **${roll.total}** — ${roll.dice.join(" + ")}${roll.mod ? ` ${roll.mod > 0 ? "+" : "−"} ${Math.abs(roll.mod)}` : ""}`;
  const dice = roll.dice.length > 1 ? `${roll.dice.join(", ")} 중 ${roll.kept}` : `${roll.kept}`;
  const mod = roll.mod ? ` ${roll.mod > 0 ? "+" : "−"} ${Math.abs(roll.mod)}` : "";
  const mode = MODE_KO[roll.mode] ? `, ${MODE_KO[roll.mode]}` : "";
  const nat = roll.natural === "20" ? " (자연 20!)" : roll.natural === "1" ? " (자연 1…)" : "";
  return `🎲 ${roll.who} · ${roll.label} (${roll.labelEn}): **${roll.total}** — d20 ${dice}${mod}${mode}${nat}`;
}

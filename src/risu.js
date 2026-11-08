// Thin wrapper around the RisuAI plugin API (v3).
// Every call is async. When running outside RisuAI (local preview),
// a small in-memory stand-in is used so the UI can still be tested.

const api = globalThis.risuai ?? globalThis.Risuai ?? null;

export const inRisu = Boolean(api);

const memoryStore = new Map();
let memoryPersonas = [];

export async function storageGet(key) {
  if (!api) return memoryStore.get(key) ?? null;
  return api.pluginStorage.getItem(key);
}

export async function storageSet(key, value) {
  if (!api) {
    memoryStore.set(key, value);
    return;
  }
  await api.pluginStorage.setItem(key, value);
}

export async function show() {
  if (api) await api.showContainer("fullscreen");
}

export async function hide() {
  if (api) await api.hideContainer();
}

export async function registerEntryPoints(open) {
  if (!api) return;
  await api.registerButton(
    { name: "모험가 명부", icon: "📜", iconType: "html", location: "hamburger", id: "adventurers-ledger-open" },
    open,
  );
  await api.registerSetting("모험가 명부", open, "📜", "html", "adventurers-ledger-setting");
}

/**
 * Save a persona into RisuAI. Returns { ok: true, id } or { ok: false, reason }.
 * If `personaId` is given and exists, that persona is updated instead.
 */
export async function savePersona({ name, prompt, note, personaId }) {
  if (!api) {
    const id = personaId ?? crypto.randomUUID();
    memoryPersonas = memoryPersonas.filter((p) => p.id !== id).concat({ id, name, personaPrompt: prompt, note });
    return { ok: true, id };
  }
  try {
    const db = await api.getDatabase(["personas"]);
    if (!db || !Array.isArray(db.personas)) {
      return { ok: false, reason: "permission" };
    }
    const personas = db.personas;
    const existing = personaId ? personas.findIndex((p) => p.id === personaId) : -1;
    const id = existing >= 0 ? personaId : crypto.randomUUID();
    const entry = {
      ...(existing >= 0 ? personas[existing] : { icon: "", largePortrait: false }),
      id,
      name,
      personaPrompt: prompt,
      note,
    };
    if (existing >= 0) personas[existing] = entry;
    else personas.push(entry);
    await api.setDatabase({ personas });
    return { ok: true, id };
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error) };
  }
}

const MENTION_LIMIT = 40;
const RECENT_LIMIT = 30;
const MESSAGE_CHARS = 1500;
const CHAT_BUDGET = 24000;
const LORE_CHARS = 6000;
const LORE_BUDGET = 16000;

const PREVIEW_LORE = [
  { key: "아일린, Eileen", secondkey: "", comment: "아일린", content: "아일린은 은빛숲 순찰대 출신의 우드 엘프 궁수다. 고향 숲이 불탄 뒤 홀로 떠돌았다.", mode: "normal" },
  { key: "은빛숲", secondkey: "", comment: "은빛숲", content: "엘프 순찰대가 지키던 숲. 아일린의 고향이며 지금은 잿더미다.", mode: "normal" },
  { key: "주점", secondkey: "", comment: "깨진 술잔 주점", content: "모험가들이 모이는 주점.", mode: "normal" },
];

/** Splits "Astarion, 아스타리온" style input into distinct search names. */
export function searchNames(name, aliases = "") {
  return [...new Set([name, ...aliases.split(/[,，\n]/)].map((v) => v.trim()).filter(Boolean))];
}

function loreScore(entry, needles) {
  const keys = [entry.key, entry.secondkey].join(",").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  const comment = (entry.comment ?? "").trim().toLowerCase();
  const content = (entry.content ?? "").toLowerCase();
  let best = 0;
  for (const raw of needles) {
    const n = raw.toLowerCase();
    let score = 0;
    if (comment === n || keys.includes(n)) score = 100;
    else if (keys.some((k) => k.includes(n))) score = 80;
    else if (comment.includes(n)) score = 70;
    else if (content.includes(n)) score = 10 + Math.min(20, content.split(n).length - 1);
    best = Math.max(best, score);
  }
  return best;
}

/**
 * Lorebook entries (character, chat, and active modules) that mention any of `names`,
 * best matches first. Entries whose keys or title are the name come before ones
 * that only mention it in their text.
 */
export async function findLore(names) {
  let entries = PREVIEW_LORE;
  if (api) {
    try {
      entries = (await api.getCurrentLorebookEntries()) ?? [];
    } catch {
      entries = [];
    }
  }
  return entries
    .map((e, index) => ({ e, index, score: e.mode === "folder" || !e.content ? 0 : loreScore(e, names) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 12)
    .map(({ e, index, score }) => ({
      id: `${index}`,
      title: e.comment || (e.key ?? "").split(",")[0].trim() || "이름 없는 항목",
      keys: [e.key, e.secondkey].filter(Boolean).join(", "),
      content: e.content,
      direct: score >= 70,
    }));
}

/**
 * Collect what the current chat knows about the companion: the character card,
 * the chosen lorebook entries, messages that mention any of `names`, and the most recent messages.
 */
export async function readChatContext(names, lore = []) {
  const picked = [];
  let loreUsed = 0;
  for (const l of lore) {
    const content = l.content.slice(0, LORE_CHARS);
    if (loreUsed + content.length > LORE_BUDGET) break;
    loreUsed += content.length;
    picked.push({ title: l.title, content });
  }
  if (!api) {
    const name = names[0];
    return {
      charName: "미리보기",
      charDesc: "",
      lore: picked,
      lines: [`[User] ${name}와 함께 숲을 걸었다.`, `[Narrator] ${name}는 낡은 활을 등에 멘 채 말없이 앞장섰다.`],
      mentions: 1,
      total: 2,
    };
  }
  const char = (await api.getCharacter()) ?? {};
  const charIndex = await api.getCurrentCharacterIndex();
  const chatIndex = await api.getCurrentChatIndex();
  const chat = await api.getChatFromIndex(charIndex, chatIndex);
  const messages = chat?.message ?? [];
  const needles = names.map((n) => n.toLowerCase());
  const charName = char.name ?? "Narrator";

  const mentionIdx = [];
  messages.forEach((m, i) => {
    const text = (m.data ?? "").toLowerCase();
    if (needles.some((n) => text.includes(n))) mentionIdx.push(i);
  });
  const recentIdx = messages.map((_, i) => i).slice(-RECENT_LIMIT);
  const chosen = [...new Set([...mentionIdx.slice(-MENTION_LIMIT), ...recentIdx])].sort((a, b) => a - b);

  const lines = [];
  let used = 0;
  for (const i of chosen.reverse()) {
    const m = messages[i];
    const speaker = m.role === "user" ? "User" : m.name || charName;
    const text = (m.data ?? "").replace(/\{\{inlayed?::[^}]*\}\}/g, "").slice(0, MESSAGE_CHARS);
    if (used + text.length > CHAT_BUDGET) break;
    used += text.length;
    lines.unshift(`[${speaker}] ${text}`);
  }

  return {
    charName,
    charDesc: (char.desc ?? "").slice(0, 3000),
    lore: picked,
    lines,
    mentions: mentionIdx.length,
    total: messages.length,
  };
}

// ---------- Chat link mode ----------

let replacerFn = null;
let diceButtonId = null;
let personaCache = { at: 0, id: null };

/** Add (or with null, remove) the function that edits main-model requests. */
export async function setRequestHook(fn) {
  if (!api) return;
  if (replacerFn) {
    try { await api.removeRisuReplacer("beforeRequest", replacerFn); } catch { /* already gone */ }
    replacerFn = null;
  }
  if (fn) {
    replacerFn = fn;
    await api.addRisuReplacer("beforeRequest", fn);
  }
}

/** Show or hide the dice button next to the chat input. */
export async function setDiceButton(onClick) {
  if (!api) return;
  if (diceButtonId) {
    try { await api.unregisterUIPart(diceButtonId); } catch { /* already gone */ }
    diceButtonId = null;
  }
  if (onClick) {
    const res = await api.registerButton(
      { name: "판정 굴리기", icon: "🎲", iconType: "html", location: "chat", id: "adventurers-ledger-dice" },
      onClick,
    );
    diceButtonId = res?.id ?? "adventurers-ledger-dice";
  }
}

/** Id of the persona currently selected in RisuAI, cached briefly. Null if unknown. */
export async function selectedPersonaId() {
  if (!api) return null;
  if (Date.now() - personaCache.at < 20000) return personaCache.id;
  let id = null;
  try {
    const db = await api.getDatabase(["personas", "selectedPersona"]);
    id = db?.personas?.[db.selectedPersona]?.id ?? null;
  } catch {
    id = null;
  }
  personaCache = { at: Date.now(), id };
  return id;
}

/** Send a message to the current chat as the user. Returns { ok } or { ok: false, reason }. */
export async function sendToChat(text) {
  if (!api) return { ok: true, preview: true };
  try {
    const sent = await api.sendChat(text);
    return sent === false ? { ok: false, reason: "permission" } : { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error) };
  }
}

/**
 * Ask the user's configured model. `which` is "model" (main) or "otherAx" (auxiliary).
 * Returns the response text, or throws with a readable message.
 */
export async function askModel(which, messages) {
  if (!api) return previewModel(messages);
  const res = await api.runLLMModel({ mode: which, messages });
  if (!res) throw new Error("모델 응답이 비어 있습니다.");
  if (res.type === "success") return res.result;
  if (res.type === "streaming") {
    const reader = res.result.getReader();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text = Object.values(value ?? {}).join("") || text;
    }
    return text;
  }
  if (res.type === "multiline") return res.result.map(([, line]) => line).join("\n");
  throw new Error(res.result || "모델 호출에 실패했습니다.");
}

/** Canned answers so the preview page can exercise the AI features without RisuAI. */
function previewModel(messages) {
  const system = messages[0]?.content ?? "";
  const user = messages[messages.length - 1]?.content ?? "";
  if (system.includes("character sheet")) {
    const name = (user.match(/Character to build: (.+)/) ?? [])[1] ?? "동료";
    return JSON.stringify({
      name, level: 4, raceId: "elf", subraceId: "wood_elf", classId: "ranger", subclassId: "gloom_stalker",
      backgroundId: "outlander", abilities: { str: 10, dex: 17, con: 13, int: 10, wis: 15, cha: 8 },
      skills: ["stealth", "perception", "survival"], spells: ["Hunter's Mark", "Fog Cloud"],
      appearance: { build: "호리호리한", eyes: "짙은 초록 눈", clothing: "이끼 낀 망토" },
      personality: { traits: "말수가 적고 늘 주변을 살핀다.", ideals: "자연은 지켜져야 한다.", bonds: "불탄 고향 숲", flaws: "사람을 쉽게 믿지 않는다." },
      backstory: `${name}는 숲을 지키던 순찰자였다.`, notes: "", basis: "from_chat",
    });
  }
  if (system.includes("revise")) {
    const payload = JSON.parse(user);
    const out = {};
    for (const [key, value] of Object.entries(payload.editable)) {
      out[key] = typeof value === "string" ? `${value} (요청 반영: ${payload.request})`.trim() : value;
    }
    return JSON.stringify(out);
  }
  return user;
}

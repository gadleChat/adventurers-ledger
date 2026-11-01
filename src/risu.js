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

/**
 * Collect what the current chat knows about `name`: the character card,
 * lorebook entries that mention the name, messages that mention it, and the most recent messages.
 */
export async function readChatContext(name) {
  if (!api) {
    return {
      charName: "미리보기",
      charDesc: "",
      lore: [],
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
  const needle = name.trim().toLowerCase();
  const charName = char.name ?? "Narrator";

  const mentionIdx = [];
  messages.forEach((m, i) => { if ((m.data ?? "").toLowerCase().includes(needle)) mentionIdx.push(i); });
  const recentIdx = messages.map((_, i) => i).slice(-RECENT_LIMIT);
  const picked = [...new Set([...mentionIdx.slice(-MENTION_LIMIT), ...recentIdx])].sort((a, b) => a - b);

  const lines = [];
  let used = 0;
  for (const i of picked.reverse()) {
    const m = messages[i];
    const speaker = m.role === "user" ? "User" : m.name || charName;
    const text = (m.data ?? "").replace(/\{\{inlayed?::[^}]*\}\}/g, "").slice(0, MESSAGE_CHARS);
    if (used + text.length > CHAT_BUDGET) break;
    used += text.length;
    lines.unshift(`[${speaker}] ${text}`);
  }

  let lore = [];
  try {
    const entries = (await api.getCurrentLorebookEntries()) ?? [];
    lore = entries
      .filter((e) => [e.key, e.secondkey, e.comment, e.content].some((v) => (v ?? "").toLowerCase().includes(needle)))
      .slice(0, 4)
      .map((e) => ({ title: e.comment || e.key, content: (e.content ?? "").slice(0, 3000) }));
  } catch {
    lore = [];
  }

  return {
    charName,
    charDesc: (char.desc ?? "").slice(0, 3000),
    lore,
    lines,
    mentions: mentionIdx.length,
    total: messages.length,
  };
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

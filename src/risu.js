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

/**
 * Ask the user's configured model. `which` is "model" (main) or "otherAx" (auxiliary).
 * Returns the response text, or throws with a readable message.
 */
export async function askModel(which, messages) {
  if (!api) {
    return messages[messages.length - 1].content;
  }
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

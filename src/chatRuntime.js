// Turns chat link mode on and off inside RisuAI. Everything here fails safe:
// on any error the request goes out exactly as RisuAI built it.

import { live } from "./live.js";
import { setRequestHook, setDiceButton, selectedPersonaId } from "./risu.js";
import { buildChatInjection, injectBlock, resolvePlayerSheet, CHAT_DEFAULTS } from "./rules/chatLink.js";

let active = { hook: false, dice: false };

async function onRequest(messages, model) {
  try {
    if (model !== "model") return messages;
    const { sheets, settings, pendingRolls } = live.get();
    if (settings.mode !== "chat") return messages;
    const options = { ...CHAT_DEFAULTS, ...settings };
    const personaId = options.chatSheetId === "auto" ? await selectedPersonaId() : null;
    const playerSheet = resolvePlayerSheet(sheets, options.chatSheetId, personaId);
    const block = buildChatInjection({ sheets, playerSheet, messages, options, pendingRolls });
    if (pendingRolls.length) live.set({ pendingRolls: [] });
    return injectBlock(messages, block);
  } catch (error) {
    console.log(`모험가 명부: 채팅 연동 건너뜀 (${error?.message ?? error})`);
    return messages;
  }
}

/** Bring hooks in line with the settings. Safe to call repeatedly. */
export async function applyChatMode(settings, openDice) {
  const options = { ...CHAT_DEFAULTS, ...settings };
  const wantHook = options.mode === "chat";
  const wantDice = wantHook && options.chatDice;
  try {
    if (wantHook !== active.hook) {
      await setRequestHook(wantHook ? onRequest : null);
      active.hook = wantHook;
    }
    if (wantDice !== active.dice) {
      await setDiceButton(wantDice ? openDice : null);
      active.dice = wantDice;
    }
  } catch (error) {
    console.log(`모험가 명부: 채팅 연동 설정 실패 (${error?.message ?? error})`);
  }
}

export { onRequest };

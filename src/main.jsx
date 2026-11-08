// Plugin entry point. Runs inside the plugin's sandboxed iframe.
import { render } from "preact";
import { App } from "./ui/App.jsx";
import { inRisu, registerEntryPoints, show, storageGet } from "./risu.js";
import { live } from "./live.js";
import { applyChatMode } from "./chatRuntime.js";
import styles from "./styles.css";

function mount() {
  if (document.getElementById("ledger-root")) return;
  const fonts = document.createElement("link");
  fonts.rel = "stylesheet";
  fonts.href = "https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap";
  document.head.appendChild(fonts);
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);
  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = "width=device-width, initial-scale=1";
  document.head.appendChild(meta);
  const root = document.createElement("div");
  root.id = "ledger-root";
  document.body.appendChild(root);
  render(<App />, root);
}

async function open() {
  live.set({ view: null });
  mount();
  await show();
}

/** Opened from the dice button next to the chat input. */
async function openDice() {
  live.set({ view: { name: "dice", fromChat: true } });
  mount();
  await show();
}

async function loadLiveState() {
  const [sheets, settings] = await Promise.all([storageGet("sheets"), storageGet("settings")]);
  live.set({ sheets: Array.isArray(sheets) ? sheets : [], settings: settings ?? {}, openDice });
  await applyChatMode(live.get().settings, openDice);
}

(async () => {
  try {
    if (inRisu) {
      await registerEntryPoints(open);
      await loadLiveState();
    } else {
      live.set({ openDice });
      mount();
    }
  } catch (error) {
    console.log(`모험가 명부 초기화 실패: ${error?.message ?? error}`);
  }
})();

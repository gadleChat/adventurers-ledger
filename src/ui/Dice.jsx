// Dice panel for chat link mode: pick a character and a check, roll in code,
// then send the result to the chat or attach it to the next message.
import { useEffect, useMemo, useState } from "preact/hooks";
import { rollableChecks, rollCheck, rollFree, rollForChat } from "../rules/dice.js";
import { resolvePlayerSheet } from "../rules/chatLink.js";
import { signed } from "../rules/calc.js";
import { live } from "../live.js";
import { selectedPersonaId, sendToChat, inRisu } from "../risu.js";
import { Icon } from "./Icon.jsx";

const MODES = [
  { id: "normal", label: "보통" },
  { id: "advantage", label: "유리함" },
  { id: "disadvantage", label: "불리함" },
];

export function DicePanel({ sheets, settings, onClose }) {
  const [whoId, setWhoId] = useState(null);
  const [mode, setMode] = useState("normal");
  const [expr, setExpr] = useState("");
  const [roll, setRoll] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(live.get().pendingRolls);

  useEffect(() => live.subscribe((st) => setPending(st.pendingRolls)), []);

  // Default to the player's own character, then the first adventurer.
  useEffect(() => {
    (async () => {
      const personaId = settings.chatSheetId === "auto" ? await selectedPersonaId() : null;
      const player = resolvePlayerSheet(sheets, settings.chatSheetId, personaId);
      const fallback = sheets.find((s) => s.meta.kind !== "companion") ?? sheets[0];
      setWhoId((player ?? fallback)?.meta.id ?? null);
    })();
  }, []);

  const who = sheets.find((s) => s.meta.id === whoId);
  const checks = useMemo(() => (who ? rollableChecks(who).groups : []), [who]);

  const record = (r) => {
    setRoll(r);
    setHistory((h) => [r, ...h].slice(0, 6));
    setStatus(null);
  };

  const send = async () => {
    if (!roll) return;
    setBusy(true);
    const res = await sendToChat(rollForChat(roll));
    setBusy(false);
    if (res.ok) {
      setStatus({ kind: "info", text: res.preview ? "미리보기 환경이라 실제 채팅에는 보내지 않았다." : "채팅에 보냈다. AI가 결과에 맞춰 이어 간다." });
      if (!res.preview) onClose();
    } else if (res.reason === "permission") {
      setStatus({ kind: "error", text: "리스가 채팅 보내기 권한을 막았다. '다음 말에 붙이기'를 쓰거나 권한을 허락해라." });
    } else {
      setStatus({ kind: "error", text: `보내지 못했다: ${res.reason}` });
    }
  };

  const attach = () => {
    if (!roll) return;
    live.set({ pendingRolls: [...live.get().pendingRolls, roll] });
    setStatus({ kind: "info", text: "다음에 보내는 메시지와 함께 AI에게 전해진다. 채팅에는 따로 보이지 않는다." });
  };

  return (
    <div class="app dice">
      <header class="topbar">
        <h1 class="brand">판정 굴리기</h1>
        <div class="topbar-actions">
          <button type="button" class="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </div>
      </header>
      <main class="dice-main">
        {!sheets.length ? (
          <p class="empty">명부에 캐릭터가 없다. 먼저 모험가를 등록해라.</p>
        ) : (
          <>
            <section class="dice-controls">
              <label class="field">
                <span class="field-label">누가 굴리나</span>
                <select class="input" value={whoId ?? ""} onChange={(e) => setWhoId(e.currentTarget.value)}>
                  {sheets.map((s) => (
                    <option value={s.meta.id}>{s.profile.name || "이름 없는 모험가"}{s.meta.kind === "companion" ? " (동료)" : ""}</option>
                  ))}
                </select>
              </label>
              <div class="segmented" role="radiogroup" aria-label="굴림 방식">
                {MODES.map((m) => (
                  <button type="button" role="radio" aria-checked={mode === m.id} class={mode === m.id ? "is-on" : ""} onClick={() => setMode(m.id)}>{m.label}</button>
                ))}
              </div>
            </section>

            <section class={`dice-result${roll ? "" : " is-empty"}`} aria-live="polite">
              {roll ? (
                <>
                  <div class="dice-total">
                    <Icon slot="step:abilities" class="dice-icon" />
                    <span class={`dice-number${roll.natural === "20" ? " is-crit" : roll.natural === "1" ? " is-fumble" : ""}`}>{roll.total}</span>
                  </div>
                  <p class="dice-label">{roll.who} · {roll.label}</p>
                  <p class="dice-break">{breakdown(roll)}</p>
                  <div class="actions">
                    <button type="button" class="btn is-primary" onClick={send} disabled={busy}>{busy ? "보내는 중…" : "채팅에 보내기"}</button>
                    <button type="button" class="btn" onClick={attach}>다음 말에 붙이기</button>
                  </div>
                </>
              ) : (
                <p class="dice-label">아래에서 굴릴 판정을 고른다.</p>
              )}
              {status ? <p class={`status is-${status.kind}`} role="status">{status.text}</p> : null}
              {pending.length ? (
                <p class="dice-pending">
                  다음 말에 붙을 굴림 {pending.length}개
                  <button type="button" class="link-btn" onClick={() => live.set({ pendingRolls: [] })}>비우기</button>
                </p>
              ) : null}
            </section>

            {checks.map((g) => (
              <section class="dice-group">
                <h4 class="sub-title">{g.title}</h4>
                <div class="dice-grid">
                  {g.items.map((item) => (
                    <button type="button" class={`dice-check${item.prof ? " is-prof" : ""}`} onClick={() => record(rollCheck(who, item, mode))}>
                      <span>{item.ko}</span>
                      <span class="dice-mod">{signed(item.mod)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}

            <section class="dice-group">
              <h4 class="sub-title">직접 굴리기</h4>
              <form class="dice-free" onSubmit={(e) => { e.preventDefault(); const r = rollFree(who, expr); if (r) record(r); else setStatus({ kind: "error", text: "2d6+3처럼 적어라." }); }}>
                <input class="input" value={expr} placeholder="예: 2d6+3, d8" onInput={(e) => setExpr(e.currentTarget.value)} />
                <button type="submit" class="btn">굴리기</button>
              </form>
            </section>

            {history.length > 1 ? (
              <section class="dice-group">
                <h4 class="sub-title">방금 굴린 것</h4>
                <ul class="dice-history">
                  {history.slice(1).map((r) => <li>{r.who} · {r.label} <b>{r.total}</b></li>)}
                </ul>
              </section>
            ) : null}
            {!inRisu ? <p class="section-hint">미리보기 환경이라 채팅에는 보내지 않는다.</p> : null}
          </>
        )}
      </main>
    </div>
  );
}

function breakdown(roll) {
  if (roll.kind === "expr") return `${roll.expr}: ${roll.dice.join(" + ")}${roll.mod ? ` ${roll.mod > 0 ? "+" : "−"} ${Math.abs(roll.mod)}` : ""}`;
  const dice = roll.dice.length > 1 ? `d20 ${roll.dice.join(", ")} → ${roll.kept}` : `d20 ${roll.kept}`;
  const mod = roll.mod ? ` ${roll.mod > 0 ? "+" : "−"} ${Math.abs(roll.mod)}` : "";
  const nat = roll.natural === "20" ? " · 자연 20" : roll.natural === "1" ? " · 자연 1" : "";
  return `${dice}${mod}${nat}`;
}

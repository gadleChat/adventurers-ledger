// "동료 데려오기": read the chat and build a companion sheet.
import { useState } from "preact/hooks";
import { METHODS, companionMessages, applyCompanion, blankCompanion } from "../rules/companion.js";
import { readChatContext, askModel, inRisu } from "../risu.js";
import { Modal, Field } from "./parts.jsx";

export function CompanionDialog({ settings, onCreate, onClose }) {
  const [name, setName] = useState("");
  const [method, setMethod] = useState("ai_full");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const start = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (method === "manual") {
      onCreate(blankCompanion(trimmed), []);
      return;
    }
    setBusy(true);
    try {
      setStatus({ kind: "info", text: "채팅을 읽는 중…" });
      const context = await readChatContext(trimmed);
      if (!context.lines.length && !context.lore.length) {
        setStatus({ kind: "error", text: "지금 열린 채팅이 비어 있다. 동료가 나오는 채팅을 연 채로 다시 해 봐라." });
        return;
      }
      setStatus({ kind: "info", text: `메시지 ${context.total}개 중 '${trimmed}'이(가) 나온 ${context.mentions}개와 최근 대화를 AI가 읽는 중…` });
      const text = await askModel(settings.companionModel, companionMessages(trimmed, context, method));
      const { sheet, warnings } = applyCompanion(trimmed, text, method);
      if (context.mentions === 0) warnings.unshift(`채팅에 '${trimmed}'이(가) 한 번도 안 나왔다. 최근 대화만 보고 만들었다.`);
      onCreate(sheet, warnings);
    } catch (e) {
      setStatus({ kind: "error", text: `만들지 못했다: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="동료 데려오기" onClose={onClose}>
      <p class="section-hint">지금 열려 있는 채팅에서 동료로 삼을 캐릭터의 이름을 적는다.</p>
      <Field label="동료 이름">
        <input class="input" value={name} placeholder="채팅에 나온 그대로" onInput={(e) => setName(e.currentTarget.value)} />
      </Field>
      <h4 class="sub-title">만드는 방식</h4>
      <div class="method-list" role="radiogroup">
        {Object.entries(METHODS).map(([id, m]) => (
          <button type="button" role="radio" aria-checked={method === id} class={`method${method === id ? " is-on" : ""}`} onClick={() => setMethod(id)}>
            <span class="method-label">{m.label}</span>
            <span class="method-help">{m.help}</span>
          </button>
        ))}
      </div>
      {method !== "manual" ? (
        <p class="section-hint">
          그 이름이 나온 메시지, 최근 대화, 이름이 걸린 로어북, 캐릭터 설명을 {settings.companionModel === "model" ? "메인" : "보조"} 모델에게 보낸다.
          {!inRisu ? " 미리보기 환경이라 실제 채팅은 읽지 않는다." : ""}
        </p>
      ) : null}
      {status ? <p class={`status is-${status.kind}`} role="status">{status.text}</p> : null}
      <div class="actions">
        <button type="button" class="btn is-primary" onClick={start} disabled={busy || !name.trim()}>
          {busy ? "만드는 중…" : method === "manual" ? "빈 명부 만들기" : "채팅 읽고 만들기"}
        </button>
      </div>
    </Modal>
  );
}

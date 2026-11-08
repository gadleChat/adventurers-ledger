// "동료 데려오기": read the chat and lorebook, then build a companion sheet.
import { useEffect, useState } from "preact/hooks";
import { METHODS, companionMessages, applyCompanion, blankCompanion } from "../rules/companion.js";
import { readChatContext, findLore, searchNames, askModel, inRisu } from "../risu.js";
import { Modal, Field } from "./parts.jsx";

export function CompanionDialog({ settings, onCreate, onClose }) {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [method, setMethod] = useState("ai_full");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [lore, setLore] = useState([]);
  const [chosen, setChosen] = useState({});
  const [openId, setOpenId] = useState(null);

  // Look up lorebook entries while the player types.
  useEffect(() => {
    const names = searchNames(name, aliases);
    if (!names.length) {
      setLore([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await findLore(names);
      if (cancelled) return;
      setLore(found);
      setChosen((prev) => Object.fromEntries(found.map((l) => [l.id, prev[l.id] ?? l.direct])));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, aliases]);

  const selectedLore = lore.filter((l) => chosen[l.id]);

  const start = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (method === "manual") {
      onCreate(blankCompanion(trimmed), []);
      return;
    }
    const names = searchNames(trimmed, aliases);
    setBusy(true);
    try {
      setStatus({ kind: "info", text: "채팅을 읽는 중…" });
      const context = await readChatContext(names, selectedLore);
      if (!context.lines.length && !context.lore.length) {
        setStatus({ kind: "error", text: "지금 열린 채팅이 비어 있고 고른 로어북도 없다. 동료가 나오는 채팅을 연 채로 다시 해 봐라." });
        return;
      }
      const loreNote = context.lore.length ? `로어북 ${context.lore.length}개, ` : "";
      setStatus({ kind: "info", text: `${loreNote}메시지 ${context.total}개 중 이름이 나온 ${context.mentions}개와 최근 대화를 AI가 읽는 중…` });
      const text = await askModel(settings.companionModel, companionMessages(trimmed, context, method, names.slice(1)));
      const { sheet, warnings } = applyCompanion(trimmed, text, method);
      if (context.lore.length < selectedLore.length) warnings.unshift(`로어북이 길어서 ${selectedLore.length}개 중 앞의 ${context.lore.length}개만 보냈다.`);
      if (context.mentions === 0 && !context.lore.length) warnings.unshift(`채팅에 '${trimmed}'이(가) 한 번도 안 나왔다. 최근 대화만 보고 만들었다.`);
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
      {method !== "manual" ? (
        <Field label="다른 이름 (선택)" hint="영어 이름, 별명처럼 채팅이나 로어북에서 부르는 이름이 따로 있으면 쉼표로 나눠 적는다.">
          <input class="input" value={aliases} placeholder="예: Eileen, 숲의 그림자" onInput={(e) => setAliases(e.currentTarget.value)} />
        </Field>
      ) : null}
      <h4 class="sub-title">만드는 방식</h4>
      <div class="method-list" role="radiogroup">
        {Object.entries(METHODS).map(([id, m]) => (
          <button type="button" role="radio" aria-checked={method === id} class={`method${method === id ? " is-on" : ""}`} onClick={() => setMethod(id)}>
            <span class="method-label">{m.label}</span>
            <span class="method-help">{m.help}</span>
          </button>
        ))}
      </div>

      {method !== "manual" && name.trim() ? (
        <>
          <h4 class="sub-title">함께 읽을 로어북</h4>
          {lore.length ? (
            <>
              <p class="section-hint">캐릭터·채팅·모듈 로어북에서 이름이 걸린 항목이다. 키나 제목이 이름인 항목은 미리 골라 뒀다.</p>
              <ul class="lore-list">
                {lore.map((l) => (
                  <li class={`lore-item${chosen[l.id] ? " is-on" : ""}`}>
                    <label class="lore-pick">
                      <input type="checkbox" checked={Boolean(chosen[l.id])} onChange={(e) => setChosen({ ...chosen, [l.id]: e.currentTarget.checked })} />
                      <span class="lore-title">{l.title}</span>
                      {l.direct ? null : <span class="lore-tag">본문에만 나옴</span>}
                    </label>
                    {l.keys ? <span class="lore-keys">키: {l.keys}</span> : null}
                    <p class="lore-text">{openId === l.id ? l.content : `${l.content.slice(0, 90)}${l.content.length > 90 ? "…" : ""}`}</p>
                    {l.content.length > 90 ? (
                      <button type="button" class="link-btn" onClick={() => setOpenId(openId === l.id ? null : l.id)}>{openId === l.id ? "접기" : "전부 보기"}</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p class="section-hint">이 이름이 걸린 로어북 항목이 없다. 다른 이름이 있으면 위에 적어 봐라.</p>
          )}
        </>
      ) : null}

      {method !== "manual" ? (
        <p class="section-hint">
          고른 로어북, 그 이름이 나온 메시지, 최근 대화, 캐릭터 설명을 {settings.companionModel === "model" ? "메인" : "보조"} 모델에게 보낸다.
          {!inRisu ? " 미리보기 환경이라 실제 채팅과 로어북은 읽지 않는다." : ""}
        </p>
      ) : null}
      {status ? <p class={`status is-${status.kind}`} role="status">{status.text}</p> : null}
      <div class="actions">
        <button type="button" class="btn is-primary" onClick={start} disabled={busy || !name.trim()}>
          {busy ? "만드는 중…" : method === "manual" ? "빈 명부 만들기" : selectedLore.length ? `로어북 ${selectedLore.length}개와 채팅 읽고 만들기` : "채팅 읽고 만들기"}
        </button>
      </div>
    </Modal>
  );
}

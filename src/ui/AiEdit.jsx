// "AI에게 고쳐 달라고 하기": pick fields, describe the change, review before/after, apply per field.
import { useState } from "preact/hooks";
import { EDIT_FIELDS, editMessages, parseEdit, applyEdits, undoEdit, formatField } from "../rules/aiEdit.js";
import { askModel } from "../risu.js";
import { Section } from "./parts.jsx";

export function AiEditPanel({ sheet, update, settings }) {
  const [fields, setFields] = useState(["traits", "backstory"]);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [changes, setChanges] = useState(null);
  const [accepted, setAccepted] = useState({});

  const toggleField = (id) => setFields((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const ask = async () => {
    setBusy(true);
    setError(null);
    setChanges(null);
    try {
      const text = await askModel(settings.editModel, editMessages(sheet, fields, request));
      const result = parseEdit(text, sheet, fields);
      setChanges(result);
      setAccepted(Object.fromEntries(result.map((c) => [c.id, true])));
      if (!result.length) setError("AI가 바꾼 내용이 없다. 요청을 조금 더 구체적으로 써 봐라.");
    } catch (e) {
      setError(`고치지 못했다: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    update((s) => applyEdits(s, changes.filter((c) => accepted[c.id])));
    setChanges(null);
    setRequest("");
  };

  const label = (id) => EDIT_FIELDS.find((f) => f.id === id)?.label ?? id;

  return (
    <Section
      title="AI에게 고쳐 달라고 하기"
      hint="고칠 칸을 고르고 원하는 걸 적는다. 고르지 않은 칸은 AI가 건드리지 않는다. 바뀐 내용을 보고 칸마다 적용할지 정한다."
      aside={sheet.history?.length ? <button type="button" class="link-btn" onClick={() => update(undoEdit)}>되돌리기 ({sheet.history.length})</button> : null}
    >
      <div class="chips field-picks" role="group" aria-label="고칠 칸">
        {EDIT_FIELDS.map((f) => (
          <button type="button" class={`chip${fields.includes(f.id) ? " is-on" : ""}`} aria-pressed={fields.includes(f.id)} onClick={() => toggleField(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <textarea
        class="input"
        rows="3"
        value={request}
        placeholder="예: 원래 좀 더 시니컬한 성격이야. 고아 설정 빼고 몰락한 귀족 집안 막내로 바꿔 줘."
        onInput={(e) => setRequest(e.currentTarget.value)}
      />
      <div class="actions">
        <button type="button" class="btn" onClick={ask} disabled={busy || !fields.length || !request.trim()}>
          {busy ? "AI가 고치는 중…" : "고쳐 달라고 하기"}
        </button>
      </div>
      {error ? <p class="status is-error" role="status">{error}</p> : null}
      {changes?.length ? (
        <div class="diff">
          {changes.map((c) => (
            <div class={`diff-row${accepted[c.id] ? "" : " is-rejected"}`}>
              <div class="diff-head">
                <h4>{label(c.id)}</h4>
                <label class="diff-accept">
                  <input type="checkbox" checked={accepted[c.id]} onChange={(e) => setAccepted({ ...accepted, [c.id]: e.currentTarget.checked })} />
                  적용
                </label>
              </div>
              <div class="diff-cols">
                <div><span class="diff-tag">전</span><p>{formatField(c.id, c.before) || "(비어 있음)"}</p></div>
                <div><span class="diff-tag is-after">후</span><p>{formatField(c.id, c.after)}</p></div>
              </div>
            </div>
          ))}
          <div class="actions">
            <button type="button" class="btn is-primary" onClick={apply} disabled={!Object.values(accepted).some(Boolean)}>고른 칸 적용</button>
            <button type="button" class="btn is-quiet" onClick={() => setChanges(null)}>전부 버리기</button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}

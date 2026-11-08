// Last step: options, equipment, translation, and saving to a RisuAI persona.
import { useState } from "preact/hooks";
import { buildPersonaText, translationMessages, parseTranslation } from "../rules/export.js";
import { allChoices, isComplete } from "../rules/choices.js";
import { spellBudget } from "../rules/calc.js";
import { t } from "../rules/data.js";
import { savePersona, askModel, inRisu } from "../risu.js";
import { Section, Toggle, Modal } from "./parts.jsx";
import { EquipmentPicker } from "./steps.jsx";

export function FinishStep({ sheet, update, d, settings, goTo }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const companion = sheet.meta.kind === "companion";

  const missing = allChoices(sheet).filter((desc) => !isComplete(sheet, desc));
  const budget = spellBudget(sheet);
  const spellGap = budget
    ? Math.max(0, budget.cantrips - sheet.spells.cantrips.length) + Math.max(0, budget.spells - sheet.spells.known.length)
    : 0;
  const hasKorean = /[가-힣]/.test(JSON.stringify([sheet.profile.appearance, sheet.profile.personality, sheet.profile.backstory, sheet.profile.notes]));

  const translate = async () => {
    setBusy(true);
    setStatus({ kind: "info", text: "번역하는 중…" });
    try {
      const text = await askModel(settings.translateModel, translationMessages(sheet));
      const profileEn = parseTranslation(text, sheet);
      update((s) => ({ ...s, profileEn }));
      setStatus({ kind: "ok", text: "영어 번역을 붙였다. '페르소나가 안 들어갔어요'에서 내용을 확인할 수 있다." });
    } catch (error) {
      setStatus({ kind: "error", text: `번역하지 못했다: ${error.message}` });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    const prompt = buildPersonaText(sheet, d, "en");
    const result = await savePersona({
      name: sheet.profile.name || "이름 없는 모험가",
      prompt,
      note: "모험가 명부로 만든 페르소나",
      personaId: sheet.meta.personaId,
    });
    setBusy(false);
    if (result.ok) {
      update((s) => ({ ...s, meta: { ...s.meta, personaId: result.id } }));
      setStatus({ kind: "ok", text: sheet.meta.personaId ? "페르소나를 새 내용으로 고쳤다." : "페르소나로 저장했다. 리스 페르소나 목록에서 고르면 된다." });
    } else {
      setStatus({
        kind: "error",
        text: result.reason === "permission"
          ? "리스가 페르소나 접근 권한을 주지 않았다. 아래 '페르소나가 안 들어갔어요'로 직접 붙여 넣을 수 있다."
          : `저장하지 못했다: ${result.reason}`,
      });
    }
  };

  return (
    <>
      {missing.length || spellGap ? (
        <Section title="아직 비어 있는 곳">
          <ul class="todo">
            {missing.slice(0, 8).map((desc) => (
              <li>
                <button type="button" class="link-btn" onClick={() => goTo(desc.level ? "growth" : desc.key.startsWith("race") ? "race" : desc.key.startsWith("background") ? "background" : "class")}>
                  {t(desc.group)} · {t(desc.title)}
                </button>
              </li>
            ))}
            {missing.length > 8 ? <li>그 밖에 {missing.length - 8}개</li> : null}
            {spellGap ? <li><button type="button" class="link-btn" onClick={() => goTo("spells")}>주문 {spellGap}개 더 고를 수 있다</button></li> : null}
          </ul>
          <p class="section-hint">비어 있어도 저장은 된다. 고른 것만 페르소나에 들어간다.</p>
        </Section>
      ) : null}

      <Section title="판정 모드">
        <Toggle
          checked={sheet.options.judgementMode}
          onChange={(v) => update((s) => ({ ...s, options: { ...s.options, judgementMode: v } }))}
          label={sheet.options.judgementMode ? "켜짐: 수치와 보너스까지 넣는다" : "꺼짐: 능력을 말로 풀어서 넣는다"}
          hint="주사위로 판정하며 놀 거면 켜고, 설정 위주로 쓸 거면 끈 채로 둔다."
        />
        {sheet.options.judgementMode ? <EquipmentPicker sheet={sheet} update={update} /> : null}
      </Section>

      {companion ? (
        <Section
          title="동료를 채팅에 넣기"
          hint={settings.mode === "chat"
            ? "채팅 연동 모드라서 최근 대화에 이 이름이 나오면 시트가 자동으로 AI에게 간다. 로어북에 따로 넣지 않아도 된다."
            : "작성기 모드에서는 리스 로어북에 넣는다. '로어북용 글 보기'에서 영어 글을 복사해 새 로어북 항목에 붙이고, 활성화 키에 동료 이름을 적는다. 설정에서 채팅 연동을 켜면 자동으로 넣어 준다."}
        >
          {settings.mode === "chat" ? (
            <Toggle
              checked={sheet.meta.chatAuto !== false}
              onChange={(v) => update((s) => ({ ...s, meta: { ...s.meta, chatAuto: v } }))}
              label="이름이 나오면 자동으로 넣기"
            />
          ) : null}
          <label class="field">
            <span class="field-label">다른 이름</span>
            <input
              class="input"
              value={(sheet.meta.aliases ?? []).join(", ")}
              placeholder="영어 이름, 별명을 쉼표로 나눠 적는다"
              onChange={(e) => {
                const aliases = e.currentTarget.value.split(/[,，]/).map((v) => v.trim()).filter(Boolean);
                update((s) => ({ ...s, meta: { ...s.meta, aliases } }));
              }}
            />
            <span class="field-hint">채팅에 이 이름들 중 하나가 나와도 동료 시트를 넣는다.</span>
          </label>
          <div class="actions">
            <button type="button" class={settings.mode === "chat" ? "btn" : "btn is-primary"} onClick={() => setShowCopy(true)}>로어북용 글 보기</button>
          </div>
        </Section>
      ) : null}

      <Section
        title={companion ? "페르소나로도 저장" : "페르소나로 저장"}
        hint={companion ? "동료를 직접 연기하고 싶을 때만 쓴다." : "AI가 읽는 글은 영어로 만든다. 직접 쓴 한국어 설정은 번역해서 붙이거나 그대로 둘 수 있다."}
      >
        <div class="actions">
          {hasKorean ? (
            <button type="button" class="btn" onClick={translate} disabled={busy}>
              {sheet.profileEn ? "다시 번역하기" : "설정을 영어로 번역"}
            </button>
          ) : null}
          <button type="button" class="btn is-primary" onClick={save} disabled={busy}>
            {sheet.meta.personaId ? "페르소나 고치기" : "페르소나로 저장"}
          </button>
          {companion ? null : <button type="button" class="btn is-quiet" onClick={() => setShowCopy(true)}>페르소나가 안 들어갔어요</button>}
        </div>
        {hasKorean && !sheet.profileEn ? <p class="section-hint">번역하지 않으면 한국어 설정이 영어 시트 안에 그대로 들어간다. 요즘 모델은 대부분 잘 읽는다.</p> : null}
        {!inRisu ? <p class="section-hint">미리보기 환경이라 실제 리스에는 저장되지 않는다.</p> : null}
        {status ? <p class={`status is-${status.kind}`} role="status">{status.text}</p> : null}
      </Section>

      {showCopy ? <CopyModal sheet={sheet} d={d} update={update} onClose={() => setShowCopy(false)} /> : null}
    </>
  );
}

function CopyModal({ sheet, d, update, onClose }) {
  const en = buildPersonaText(sheet, d, "en");
  const ko = buildPersonaText(sheet, d, "ko");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(en);
      setCopied(true);
    } catch {
      const area = document.getElementById("copy-en");
      area?.select();
      setCopied(false);
    }
  };
  return (
    <Modal title="직접 붙여 넣기" onClose={onClose} wide>
      <p class="section-hint">
        {sheet.meta.kind === "companion"
          ? "로어북 항목 내용 칸에 왼쪽 영어 글을 붙여 넣고, 활성화 키에 동료 이름을 적는다. 오른쪽은 확인용 한국어다."
          : "리스의 페르소나 설명 칸에 왼쪽 영어 글을 붙여 넣으면 된다. 오른쪽은 확인용 한국어다."}
      </p>
      <div class="copy-grid">
        <div>
          <h4 class="sub-title">영어 (붙여 넣을 글)</h4>
          <textarea id="copy-en" class="input mono" rows="18" readOnly value={en} />
        </div>
        <div>
          <h4 class="sub-title">한국어 (확인용)</h4>
          <textarea class="input mono" rows="18" readOnly value={ko} />
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn is-primary" onClick={copy}>{copied ? "복사했다" : "영어 글 복사"}</button>
        {sheet.profileEn ? (
          <button type="button" class="btn is-quiet" onClick={() => update((s) => ({ ...s, profileEn: null }))}>번역 지우기</button>
        ) : null}
      </div>
    </Modal>
  );
}

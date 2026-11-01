// Top-level screens: the ledger index (saved adventurers) and the editor.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { t } from "../rules/data.js";
import { newSheet, getRace, getSubrace, getClass, level as levelOf, touch } from "../rules/sheet.js";
import { creationChoices, levelChoices, isComplete } from "../rules/choices.js";
import { derive, spellBudget } from "../rules/calc.js";
import { storageGet, storageSet, hide } from "../risu.js";
import { Modal, Toggle } from "./parts.jsx";
import { Ledger } from "./Ledger.jsx";
import { RaceStep, ClassStep, BackgroundStep, AbilitiesStep, GrowthStep, SpellStep, ProfileStep } from "./steps.jsx";
import { FinishStep } from "./FinishStep.jsx";
import { CompanionDialog } from "./Companion.jsx";

const DEFAULT_SETTINGS = { mode: "writer", translateModel: "otherAx", companionModel: "model", editModel: "model" };

const STEPS = [
  { id: "race", label: "종족", en: "Race" },
  { id: "class", label: "직업", en: "Class" },
  { id: "background", label: "배경", en: "Background" },
  { id: "abilities", label: "능력치", en: "Abilities" },
  { id: "growth", label: "성장", en: "Growth" },
  { id: "spells", label: "주문", en: "Spells" },
  { id: "profile", label: "외형·설정", en: "Profile" },
  { id: "finish", label: "명부 완성", en: "Finish" },
];

export function App() {
  const [sheets, setSheets] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [editingId, setEditingId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCompanion, setShowCompanion] = useState(false);
  const [notices, setNotices] = useState([]);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const stored = await storageGet("sheets");
      const storedSettings = await storageGet("settings");
      setSheets(Array.isArray(stored) ? stored : []);
      if (storedSettings) setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
    })();
  }, []);

  const persist = (next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => storageSet("sheets", next), 300);
  };

  const updateSheet = (id, fn) => {
    setSheets((cur) => {
      const next = cur.map((s) => (s.meta.id === id ? touch(fn(s)) : s));
      persist(next);
      return next;
    });
  };

  const saveSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    storageSet("settings", next);
  };

  if (!sheets) return <div class="app is-loading">명부를 펼치는 중…</div>;

  const current = sheets.find((s) => s.meta.id === editingId);
  if (current) {
    return (
      <Editor
        sheet={current}
        update={(fn) => updateSheet(current.meta.id, fn)}
        settings={settings}
        notices={notices}
        dismissNotices={() => setNotices([])}
        onBack={() => { setEditingId(null); setNotices([]); }}
      />
    );
  }

  const create = () => {
    const sheet = newSheet();
    const next = [sheet, ...sheets];
    setSheets(next);
    persist(next);
    setEditingId(sheet.meta.id);
  };
  const addCompanion = (sheet, warnings) => {
    const next = [sheet, ...sheets];
    setSheets(next);
    persist(next);
    setNotices(warnings);
    setShowCompanion(false);
    setEditingId(sheet.meta.id);
  };
  const remove = (id) => {
    const next = sheets.filter((s) => s.meta.id !== id);
    setSheets(next);
    persist(next);
  };
  const duplicate = (sheet) => {
    const copy = JSON.parse(JSON.stringify(sheet));
    copy.meta = { ...copy.meta, id: crypto.randomUUID(), personaId: null, createdAt: new Date().toISOString() };
    copy.profile.name = copy.profile.name ? `${copy.profile.name} (사본)` : "";
    const next = [copy, ...sheets];
    setSheets(next);
    persist(next);
  };

  return (
    <div class="app home">
      <header class="topbar">
        <h1 class="brand">모험가 명부</h1>
        <div class="topbar-actions">
          <button type="button" class="btn is-quiet" onClick={() => setShowSettings(true)}>설정</button>
          <button type="button" class="icon-btn" onClick={hide} aria-label="닫기">✕</button>
        </div>
      </header>
      <main class="home-main">
        <section class="home-intro">
          <p>세계관에 맞는 페르소나를 D&D 규칙으로 만들어 리스 페르소나로 저장한다.</p>
          <div class="actions">
            <button type="button" class="btn is-primary is-large" onClick={create}>새 모험가 등록</button>
            <button type="button" class="btn is-large" onClick={() => setShowCompanion(true)}>동료 데려오기</button>
          </div>
        </section>
        {sheets.length ? (
          <ol class="roster">
            {sheets.map((s) => (
              <RosterEntry sheet={s} onOpen={() => setEditingId(s.meta.id)} onDuplicate={() => duplicate(s)} onRemove={() => remove(s.meta.id)} />
            ))}
          </ol>
        ) : (
          <p class="empty">아직 명부에 이름이 없다. 첫 모험가를 등록해 보자.</p>
        )}
      </main>
      {showSettings ? <SettingsModal settings={settings} save={saveSettings} onClose={() => setShowSettings(false)} /> : null}
      {showCompanion ? <CompanionDialog settings={settings} onCreate={addCompanion} onClose={() => setShowCompanion(false)} /> : null}
    </div>
  );
}

function RosterEntry({ sheet, onOpen, onDuplicate, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const race = getRace(sheet);
  const sub = getSubrace(sheet);
  const cls = getClass(sheet);
  const raceName = sheet.race.custom?.name || t(sub?.name ?? race?.name);
  const line = [raceName, cls ? `${levelOf(sheet)}레벨 ${t(cls.name)}` : null].filter(Boolean).join(" · ");
  return (
    <li class="roster-entry">
      <button type="button" class="roster-open" onClick={onOpen}>
        <span class="roster-name">{sheet.profile.name || (sheet.meta.kind === "companion" ? "이름 없는 동료" : "이름 없는 모험가")}</span>
        <span class="roster-line">{line || "아직 정하지 않음"}</span>
        {sheet.meta.kind === "companion" ? <span class="roster-tag is-companion">동료</span> : null}
        {sheet.meta.personaId ? <span class="roster-tag">페르소나 저장됨</span> : null}
      </button>
      <div class="roster-actions">
        <button type="button" class="link-btn" onClick={onDuplicate}>복사</button>
        {confirming ? (
          <>
            <button type="button" class="link-btn is-danger" onClick={onRemove}>정말 지우기</button>
            <button type="button" class="link-btn" onClick={() => setConfirming(false)}>취소</button>
          </>
        ) : (
          <button type="button" class="link-btn" onClick={() => setConfirming(true)}>지우기</button>
        )}
      </div>
    </li>
  );
}

function SettingsModal({ settings, save, onClose }) {
  return (
    <Modal title="설정" onClose={onClose}>
      <h4 class="sub-title">사용 방식</h4>
      <div class="segmented" role="radiogroup">
        <button type="button" role="radio" aria-checked={settings.mode === "writer"} class={settings.mode === "writer" ? "is-on" : ""} onClick={() => save({ mode: "writer" })}>
          페르소나 작성기
        </button>
        <button type="button" role="radio" aria-checked={false} disabled>채팅 연동 (준비 중)</button>
      </div>
      <p class="section-hint">작성기 모드는 페르소나를 만들어 저장하는 것까지만 한다. 채팅에는 끼어들지 않아서 응답 속도에 영향이 없다.</p>
      <h4 class="sub-title">번역에 쓸 모델</h4>
      <div class="segmented" role="radiogroup">
        <button type="button" role="radio" aria-checked={settings.translateModel === "otherAx"} class={settings.translateModel === "otherAx" ? "is-on" : ""} onClick={() => save({ translateModel: "otherAx" })}>보조 모델</button>
        <button type="button" role="radio" aria-checked={settings.translateModel === "model"} class={settings.translateModel === "model" ? "is-on" : ""} onClick={() => save({ translateModel: "model" })}>메인 모델</button>
      </div>
      <ModelPicker label="동료 만들기에 쓸 모델" value={settings.companionModel} onChange={(v) => save({ companionModel: v })} />
      <ModelPicker label="AI 수정에 쓸 모델" value={settings.editModel} onChange={(v) => save({ editModel: v })} />
      <p class="section-hint">리스 설정에 정해 둔 메인·보조 모델을 그대로 쓴다. 동료 만들기와 수정은 글 품질이 중요해서 메인 모델을 권한다.</p>
    </Modal>
  );
}

function ModelPicker({ label, value, onChange }) {
  return (
    <>
      <h4 class="sub-title">{label}</h4>
      <div class="segmented" role="radiogroup">
        <button type="button" role="radio" aria-checked={value === "model"} class={value === "model" ? "is-on" : ""} onClick={() => onChange("model")}>메인 모델</button>
        <button type="button" role="radio" aria-checked={value === "otherAx"} class={value === "otherAx" ? "is-on" : ""} onClick={() => onChange("otherAx")}>보조 모델</button>
      </div>
    </>
  );
}

function Editor({ sheet, update, settings, notices, dismissNotices, onBack }) {
  const [step, setStep] = useState("race");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const d = useMemo(() => derive(sheet), [sheet]);
  const mainRef = useRef(null);

  const budget = spellBudget(sheet);
  const status = {
    race: Boolean(sheet.race.raceId || sheet.race.custom) && creationChoices(sheet).filter((c) => c.key.startsWith("race:")).every((c) => isComplete(sheet, c)),
    class: Boolean(sheet.class.classId) && creationChoices(sheet).filter((c) => c.key === "class:skills").every((c) => isComplete(sheet, c)),
    background: Boolean(sheet.background.backgroundId || sheet.background.custom),
    abilities: sheet.abilities.bonus.every((c) => c.ability),
    growth: Boolean(sheet.class.classId) && Array.from({ length: levelOf(sheet) }, (_, i) => levelChoices(sheet, i + 1)).flat().every((c) => isComplete(sheet, c)),
    spells: Boolean(sheet.class.classId) && (!budget || (sheet.spells.cantrips.length >= budget.cantrips && sheet.spells.known.length >= budget.spells)),
    profile: Boolean(sheet.profile.name),
    finish: Boolean(sheet.meta.personaId),
  };

  const goTo = (id) => {
    setStep(id);
    mainRef.current?.scrollTo?.(0, 0);
  };
  useEffect(() => {
    document.querySelector(".step.is-current")?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [step]);
  const index = STEPS.findIndex((s) => s.id === step);

  const body = {
    race: <RaceStep sheet={sheet} update={update} />,
    class: <ClassStep sheet={sheet} update={update} />,
    background: <BackgroundStep sheet={sheet} update={update} />,
    abilities: <AbilitiesStep sheet={sheet} update={update} />,
    growth: <GrowthStep sheet={sheet} update={update} />,
    spells: <SpellStep sheet={sheet} update={update} />,
    profile: <ProfileStep sheet={sheet} update={update} settings={settings} />,
    finish: <FinishStep sheet={sheet} update={update} d={d} settings={settings} goTo={goTo} />,
  }[step];

  return (
    <div class="app editor">
      <header class="topbar">
        <button type="button" class="link-btn back" onClick={onBack}>명부 목록</button>
        <h1 class="brand is-small">{sheet.profile.name || (sheet.meta.kind === "companion" ? "새 동료" : "새 모험가")}</h1>
        <div class="topbar-actions">
          <button type="button" class="btn is-quiet ledger-toggle" onClick={() => setLedgerOpen(true)}>명부 보기</button>
          <button type="button" class="icon-btn" onClick={hide} aria-label="닫기">✕</button>
        </div>
      </header>
      <div class="editor-body">
        <nav class="steps" aria-label="만드는 단계">
          <ol>
            {STEPS.map((s, i) => (
              <li>
                <button type="button" class={`step${s.id === step ? " is-current" : ""}${status[s.id] ? " is-done" : ""}`} aria-current={s.id === step ? "step" : undefined} onClick={() => goTo(s.id)}>
                  <span class="step-num">{i + 1}</span>
                  <span class="step-label">{s.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <main class="editor-main" ref={mainRef}>
          {notices.length || sheet.meta.autoFilled ? (
            <div class="notice" role="status">
              {sheet.meta.autoFilled ? <p>AI가 채팅을 읽고 채운 동료다. 레벨마다 고를 것 중 AI가 정하지 않은 건 무난한 걸로 자동으로 채웠으니, 단계마다 훑어보고 바꾸면 된다.</p> : null}
              {notices.map((n) => <p>{n}</p>)}
              <button type="button" class="link-btn" onClick={() => { dismissNotices(); if (sheet.meta.autoFilled) update((s) => ({ ...s, meta: { ...s.meta, autoFilled: false } })); }}>확인</button>
            </div>
          ) : null}
          {body}
          <footer class="step-nav">
            {index > 0 ? <button type="button" class="btn is-quiet" onClick={() => goTo(STEPS[index - 1].id)}>이전: {STEPS[index - 1].label}</button> : <span />}
            {index < STEPS.length - 1 ? <button type="button" class="btn" onClick={() => goTo(STEPS[index + 1].id)}>다음: {STEPS[index + 1].label}</button> : null}
          </footer>
        </main>
        <aside class="editor-ledger">
          <Ledger sheet={sheet} d={d} />
        </aside>
      </div>
      {ledgerOpen ? (
        <Modal title="명부" onClose={() => setLedgerOpen(false)}>
          <Ledger sheet={sheet} d={d} />
        </Modal>
      ) : null}
    </div>
  );
}

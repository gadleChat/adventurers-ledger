// Renders one choice descriptor (see rules/choices.js) and writes the answer back.
import { useState } from "preact/hooks";
import { t, ABILITIES, abilityName, featById } from "../rules/data.js";
import { getChoice, setChoice } from "../rules/sheet.js";
import { isComplete } from "../rules/choices.js";
import { abilityScores } from "../rules/calc.js";
import { feats } from "../rules/data.js";
import { Option } from "./parts.jsx";

export function ChoicePicker({ sheet, update, desc, bg3Only }) {
  const value = getChoice(sheet, desc);
  const done = isComplete(sheet, desc);
  const set = (v) => update((s) => setChoice(s, desc, v));

  return (
    <div class={`choice${done ? " is-done" : ""}`}>
      <div class="choice-head">
        <h4>{t(desc.title)}</h4>
        <span class="choice-count">
          {desc.kind === "pick" ? `${(value ?? []).length} / ${desc.count}` : done ? "완료" : "선택 필요"}
        </span>
      </div>
      {desc.help && desc.kind !== "subclass" ? <p class="choice-help">{t(desc.help)}</p> : null}
      {desc.kind === "pick" ? <PickList desc={desc} value={value ?? []} set={set} bg3Only={bg3Only} /> : null}
      {desc.kind === "subclass" ? (
        <div class="option-grid">
          {desc.options.map((o) => (
            <Option name={o.name} summary={o.desc} selected={value === o.id} onSelect={() => set(o.id)} />
          ))}
        </div>
      ) : null}
      {desc.kind === "text" ? (
        <input class="input" value={value ?? ""} placeholder="직접 입력" onInput={(e) => set(e.currentTarget.value)} />
      ) : null}
      {desc.kind === "asiOrFeat" ? <AsiOrFeat sheet={sheet} value={value} set={set} /> : null}
    </div>
  );
}

function PickList({ desc, value, set, bg3Only }) {
  const [query, setQuery] = useState("");
  const toggle = (id) => {
    if (value.includes(id)) set(value.filter((v) => v !== id));
    else if (desc.count === 1) set([id]);
    else if (value.length < desc.count) set([...value, id]);
  };
  let options = desc.options;
  if (bg3Only) options = options.filter((o) => o.bg3 !== false || value.includes(o.id));
  if (query) {
    const q = query.toLowerCase();
    options = options.filter((o) => t(o.name).includes(query) || t(o.name, "en").toLowerCase().includes(q));
  }
  return (
    <>
      {desc.options.length > 12 ? (
        <input class="input search" type="search" placeholder="이름으로 찾기" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      ) : null}
      <div class="option-grid">
        {options.map((o) => (
          <Option
            compact
            name={o.name}
            summary={o.desc && t(o.desc).length < 90 ? o.desc : null}
            desc={o.desc}
            note={o.note}
            disabled={o.disabled && !value.includes(o.id)}
            selected={value.includes(o.id)}
            onSelect={() => toggle(o.id)}
          />
        ))}
      </div>
    </>
  );
}

function AsiOrFeat({ sheet, value, set }) {
  const mode = value?.type ?? "asi";
  const scores = abilityScores(sheet, { excludeFeats: true });
  const increases = value?.type === "asi" ? value.increases ?? {} : {};
  const spent = Object.values(increases).reduce((a, b) => a + b, 0);
  const bump = (ab, delta) => {
    const next = { ...increases, [ab]: Math.max(0, (increases[ab] ?? 0) + delta) };
    if (next[ab] === 0) delete next[ab];
    const total = Object.values(next).reduce((a, b) => a + b, 0);
    if (total > 2) return;
    set({ type: "asi", increases: next });
  };
  return (
    <div class="asi">
      <div class="segmented" role="radiogroup">
        <button type="button" role="radio" aria-checked={mode === "asi"} class={mode === "asi" ? "is-on" : ""} onClick={() => set({ type: "asi", increases: {} })}>
          능력치 향상
        </button>
        <button type="button" role="radio" aria-checked={mode === "feat"} class={mode === "feat" ? "is-on" : ""} onClick={() => set({ type: "feat", featId: null })}>
          특기
        </button>
      </div>
      {mode === "asi" ? (
        <>
          <p class="choice-help">합쳐서 2점을 올린다. 한 능력치에 2점, 또는 두 능력치에 1점씩. 최대 20.</p>
          <div class="asi-grid">
            {ABILITIES.map((ab) => (
              <div class="asi-row">
                <span>{abilityName(ab)}</span>
                <span class="num">{scores[ab]}{increases[ab] ? ` +${increases[ab]}` : ""}</span>
                <span class="stepper">
                  <button type="button" onClick={() => bump(ab, -1)} disabled={!increases[ab]} aria-label={`${abilityName(ab)} 내리기`}>−</button>
                  <button type="button" onClick={() => bump(ab, 1)} disabled={spent >= 2 || scores[ab] + (increases[ab] ?? 0) >= 20} aria-label={`${abilityName(ab)} 올리기`}>+</button>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <FeatList sheet={sheet} value={value?.featId} onPick={(featId) => set({ type: "feat", featId })} />
      )}
    </div>
  );
}

export function FeatList({ sheet, value, onPick }) {
  const scores = abilityScores(sheet, { excludeFeats: true });
  return (
    <div class="option-grid">
      {feats.map((f) => {
        const req = f.requires?.ability;
        const ok = !req || (f.requires.anyOf
          ? Object.entries(req).some(([ab, min]) => scores[ab] >= min)
          : Object.entries(req).every(([ab, min]) => scores[ab] >= min));
        const reqText = req ? Object.entries(req).map(([ab, min]) => `${abilityName(ab)} ${min}`).join(f.requires.anyOf ? " 또는 " : ", ") : null;
        return (
          <Option
            compact
            name={f.name}
            summary={f.desc}
            note={reqText ? { ko: `조건: ${reqText}`, en: "" } : null}
            disabled={!ok}
            selected={value === f.id}
            badge={f.bg3 ? null : "발더게3 밖"}
            onSelect={() => onPick(f.id)}
          />
        );
      })}
    </div>
  );
}

export { featById };

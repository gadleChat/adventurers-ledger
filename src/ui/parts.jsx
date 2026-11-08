// Shared UI pieces.
import { useState } from "preact/hooks";
import { t } from "../rules/data.js";
import { Icon } from "./Icon.jsx";

/** A selectable entry: Korean name, small English original, and a one-line summary. */
export function Option({ name, summary, desc, selected, disabled, note, onSelect, badge, compact, icon }) {
  const [open, setOpen] = useState(false);
  const detail = desc && t(desc) !== t(summary) ? desc : null;
  return (
    <div class={`option${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}${compact ? " is-compact" : ""}`}>
      <button
        type="button"
        class={`option-main${icon ? " has-icon" : ""}`}
        disabled={disabled}
        aria-pressed={selected ? "true" : "false"}
        onClick={onSelect}
      >
        {icon ? <Icon slot={icon} class="option-icon" /> : null}
        <span class="option-name">
          {t(name)}
          {badge ? <span class="option-badge">{badge}</span> : null}
        </span>
        <span class="option-en">{name?.bg3En && name.bg3En !== name.en ? `${name.en} · BG3: ${name.bg3En}` : t(name, "en")}</span>
        {summary ? <span class="option-summary">{t(summary)}</span> : null}
        {note ? <span class="option-note">{t(note)}</span> : null}
      </button>
      {detail ? (
        <button type="button" class="option-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "접기" : "자세히"}
        </button>
      ) : null}
      {detail && open ? (
        <div class="option-detail">
          <p>{t(detail)}</p>
          <p class="option-detail-en">{t(detail, "en")}</p>
        </div>
      ) : null}
    </div>
  );
}

export function Section({ title, hint, children, aside }) {
  return (
    <section class="section">
      <header class="section-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {hint ? <p class="section-hint">{hint}</p> : null}
      {children}
    </section>
  );
}

export function Chips({ items, onPick }) {
  return (
    <div class="chips">
      {items.map((item) => (
        <button type="button" class="chip" onClick={() => onPick(item)}>{t(item)}</button>
      ))}
    </div>
  );
}

export function Field({ label, children, en }) {
  return (
    <label class="field">
      <span class="field-label">
        {label}
        {en ? <span class="field-en">{en}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div class="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={`modal${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header class="modal-head">
          <h3>{title}</h3>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb" /></span>
      <span class="toggle-text">
        <span>{label}</span>
        {hint ? <span class="toggle-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

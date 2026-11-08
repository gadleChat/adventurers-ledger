// The creation steps.
import { Icon } from "./Icon.jsx";
import { useState } from "preact/hooks";
import {
  races, classes, backgrounds, ABILITIES, abilityName, skillName, t, glossary,
  appearanceFields, spellById, schoolName, getSubclass, equipment,
} from "../rules/data.js";
import {
  getRace, getSubrace, getClass, getBackground, raceTraits, setRace, setCustomRace,
  setClass, setLevel, setBackground, level as levelOf, defaultBonusChips,
} from "../rules/sheet.js";
import { creationChoices, levelChoices } from "../rules/choices.js";
import { derive, mod, signed, abilityWord, spellBudget, spellChoicePool, classFeatures, schoolAllowance, schoolAllows } from "../rules/calc.js";
import { Option, Section, Chips, Field, Toggle } from "./parts.jsx";
import { ChoicePicker } from "./ChoicePicker.jsx";
import { AiEditPanel } from "./AiEdit.jsx";

const sizeName = (s) => t(glossary.sizes[s]);

/* ---------- Race ---------- */

export function RaceStep({ sheet, update }) {
  const race = getRace(sheet);
  const sub = getSubrace(sheet);
  const custom = sheet.race.custom;
  const choices = creationChoices(sheet).filter((d) => d.key.startsWith("race:"));
  const traits = raceTraits(sheet);

  return (
    <>
      <Section title="종족" hint="태어난 혈통. 능력치 보너스는 능력치 단계에서 원하는 곳으로 옮길 수 있다.">
        <div class="option-grid is-wide">
          {races.map((r) => (
            <Option icon={`race:${r.id}`} name={r.name} summary={r.summary} selected={!custom && race?.id === r.id} onSelect={() => update((s) => setRace(s, r.id))} />
          ))}
          <Option
            icon="race:custom"
            name={{ ko: "직접 만들기", en: "Custom race" }}
            summary={{ ko: "세계관 고유의 종족을 이름과 설명으로 만든다.", en: "" }}
            selected={Boolean(custom)}
            onSelect={() => update((s) => setCustomRace(s, s.race.custom ?? { name: "", desc: "", size: "medium", speed: 30, traits: [] }))}
          />
        </div>
      </Section>

      {race && !custom ? (
        <Section title={t(race.name)} hint={t(race.desc)}>
          <p class="facts">
            <span>{sizeName(race.size)}</span>
            <span>이동 속도 {race.speed}피트</span>
          </p>
          {race.rulesNote ? <p class="note">{t(race.rulesNote)}</p> : null}
          {race.subraces.length ? (
            <>
              <h4 class="sub-title">하위 종족</h4>
              <div class="option-grid">
                {race.subraces.map((sr) => (
                  <Option name={sr.name} summary={sr.summary} desc={sr.desc} selected={sub?.id === sr.id} onSelect={() => update((s) => setRace(s, race.id, sr.id))} />
                ))}
              </div>
            </>
          ) : null}
        </Section>
      ) : null}

      {custom ? <CustomRace sheet={sheet} update={update} /> : null}

      {traits.length ? (
        <Section title="종족 특성">
          <ul class="trait-list">
            {traits.map((tr) => (
              <li>
                <strong>{t(tr.name)}</strong> <span class="en">{t(tr.name, "en")}</span>
                <p>{t(tr.desc)}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {choices.length ? (
        <Section title="종족에서 고를 것">
          {choices.map((d) => <ChoicePicker sheet={sheet} update={update} desc={d} />)}
        </Section>
      ) : null}
    </>
  );
}

function CustomRace({ sheet, update }) {
  const c = sheet.race.custom;
  const set = (patch) => update((s) => setCustomRace(s, { ...s.race.custom, ...patch }));
  return (
    <Section title="직접 만든 종족" hint="능력치 보너스는 +2와 +1 하나씩 원하는 곳에 둔다. 특성은 글로 적으면 페르소나에 그대로 들어간다.">
      <div class="form-grid">
        <Field label="종족 이름"><input class="input" value={c.name} onInput={(e) => set({ name: e.currentTarget.value })} /></Field>
        <Field label="크기">
          <select class="input" value={c.size} onChange={(e) => set({ size: e.currentTarget.value })}>
            {["small", "medium", "large"].map((s) => <option value={s}>{sizeName(s)}</option>)}
          </select>
        </Field>
        <Field label="이동 속도 (피트)"><input class="input" type="number" min="10" max="60" step="5" value={c.speed} onInput={(e) => set({ speed: Number(e.currentTarget.value) || 30 })} /></Field>
      </div>
      <Field label="종족 설명과 특성">
        <textarea class="input" rows="4" value={c.desc} placeholder="어떤 종족인지, 어떤 힘을 타고나는지 자유롭게" onInput={(e) => set({ desc: e.currentTarget.value, traits: e.currentTarget.value ? [{ id: "custom", name: { ko: "종족 특성", en: "Racial traits" }, desc: { ko: e.currentTarget.value, en: e.currentTarget.value }, effects: [] }] : [] })} />
      </Field>
    </Section>
  );
}

/* ---------- Class ---------- */

export function ClassStep({ sheet, update }) {
  const cls = getClass(sheet);
  const lvl = levelOf(sheet);
  const skillChoice = creationChoices(sheet).find((d) => d.key === "class:skills");
  return (
    <>
      <Section title="직업" hint="멀티클래스는 아직 지원하지 않는다.">
        <div class="option-grid is-wide">
          {classes.map((c) => (
            <Option icon={`class:${c.id}`} name={c.name} summary={c.summary} selected={cls?.id === c.id} onSelect={() => update((s) => setClass(s, c.id))} />
          ))}
        </div>
      </Section>
      <Section title="레벨" hint="높은 레벨로 만들면 1레벨부터 그 레벨까지 생기는 선택을 성장 단계에서 차례로 고른다.">
        <div class="level-picker">
          <button type="button" class="step-btn" onClick={() => update((s) => setLevel(s, lvl - 1))} disabled={lvl <= 1} aria-label="레벨 내리기">−</button>
          <input type="range" min="1" max="20" value={lvl} aria-label="레벨" onInput={(e) => update((s) => setLevel(s, Number(e.currentTarget.value)))} />
          <button type="button" class="step-btn" onClick={() => update((s) => setLevel(s, lvl + 1))} disabled={lvl >= 20} aria-label="레벨 올리기">+</button>
          <span class="level-value">{lvl}</span>
        </div>
      </Section>
      {cls ? (
        <Section title={t(cls.name)} hint={t(cls.desc)}>
          <dl class="facts-grid">
            <dt>생명력 주사위</dt><dd>d{cls.hitDie}</dd>
            <dt>주요 능력치</dt><dd>{cls.primary.map((a) => abilityName(a)).join(", ")}</dd>
            <dt>내성 숙련</dt><dd>{cls.saves.map((a) => abilityName(a)).join(", ")}</dd>
            <dt>{t(cls.subclassTitle)}</dt><dd>{cls.subclassLevel}레벨에 선택</dd>
            <dt>주문</dt><dd>{cls.spellcasting ? `${abilityName(cls.spellcasting.ability)} 기반` : "없음 (일부 하위 직업 제외)"}</dd>
          </dl>
          {skillChoice ? <ChoicePicker sheet={sheet} update={update} desc={skillChoice} /> : null}
        </Section>
      ) : null}
    </>
  );
}

/* ---------- Background ---------- */

export function BackgroundStep({ sheet, update }) {
  const bg = getBackground(sheet);
  const custom = sheet.background.custom;
  const langChoice = creationChoices(sheet).find((d) => d.key === "background:languages");
  return (
    <>
      <Section title="배경" hint="모험을 떠나기 전의 삶. 성격 예시는 외형·설정 단계에서 쓸 수 있다.">
        <div class="option-grid is-wide">
          {backgrounds.map((b) => (
            <Option icon={`background:${b.id}`} name={b.name} summary={b.summary} badge={b.bg3 ? null : "발더게3 밖"} selected={!custom && bg?.id === b.id} onSelect={() => update((s) => setBackground(s, b.id))} />
          ))}
          <Option
            icon="background:custom"
            name={{ ko: "직접 만들기", en: "Custom background" }}
            summary={{ ko: "세계관에 맞는 출신을 직접 적는다.", en: "" }}
            selected={Boolean(custom)}
            onSelect={() => update((s) => ({ ...s, background: { backgroundId: null, custom: s.background.custom ?? { name: "", desc: "" } } }))}
          />
        </div>
      </Section>
      {bg && !custom ? (
        <Section title={t(bg.name)}>
          <dl class="facts-grid">
            <dt>기술 숙련</dt><dd>{bg.skills.map((s) => skillName(s)).join(", ")}</dd>
            <dt>{t(bg.feature.name)}</dt><dd>{t(bg.feature.desc)}</dd>
          </dl>
          {langChoice ? <ChoicePicker sheet={sheet} update={update} desc={langChoice} /> : null}
        </Section>
      ) : null}
      {custom ? (
        <Section title="직접 만든 배경">
          <Field label="배경 이름">
            <input class="input" value={custom.name} onInput={(e) => update((s) => ({ ...s, background: { ...s.background, custom: { ...s.background.custom, name: e.currentTarget.value } } }))} />
          </Field>
          <Field label="설명">
            <textarea class="input" rows="3" value={custom.desc} onInput={(e) => update((s) => ({ ...s, background: { ...s.background, custom: { ...s.background.custom, desc: e.currentTarget.value } } }))} />
          </Field>
        </Section>
      ) : null}
    </>
  );
}

/* ---------- Abilities ---------- */

const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const STANDARD = [15, 14, 13, 12, 10, 8];

export function AbilitiesStep({ sheet, update }) {
  const { method, base, bonus } = sheet.abilities;
  const d = derive(sheet);
  const spent = ABILITIES.reduce((sum, ab) => sum + (POINT_COST[base[ab]] ?? 0), 0);
  const setBase = (ab, v) => update((s) => ({ ...s, abilities: { ...s.abilities, base: { ...s.abilities.base, [ab]: v } } }));
  const setMethod = (m) => update((s) => ({
    ...s,
    abilities: {
      ...s.abilities,
      method: m,
      base: m === "standard" ? Object.fromEntries(ABILITIES.map((a, i) => [a, STANDARD[i]])) : m === "pointBuy" ? Object.fromEntries(ABILITIES.map((a) => [a, 8])) : s.abilities.base,
    },
  }));
  const setChip = (i, ab) => update((s) => {
    const chips = s.abilities.bonus.map((c, j) => (j === i ? { ...c, ability: ab || null } : c.ability === ab ? { ...c, ability: null } : c));
    return { ...s, abilities: { ...s.abilities, bonus: chips } };
  });
  const resetChips = () => update((s) => ({ ...s, abilities: { ...s.abilities, bonus: s.race.custom ? s.abilities.bonus.map((c) => ({ ...c, ability: null })) : defaultBonusChips(getRace(s), getSubrace(s)) } }));

  return (
    <>
      <Section title="능력치 정하는 방식">
        <div class="segmented" role="radiogroup">
          {[["pointBuy", "포인트 구매"], ["standard", "표준 배열"], ["manual", "직접 입력"]].map(([id, label]) => (
            <button type="button" role="radio" aria-checked={method === id} class={method === id ? "is-on" : ""} onClick={() => setMethod(id)}>{label}</button>
          ))}
        </div>
        <p class="section-hint">
          {method === "pointBuy" ? `27점으로 8~15 사이에서 산다. 남은 점수 ${27 - spent}점.` : null}
          {method === "standard" ? "15, 14, 13, 12, 10, 8을 하나씩 배치한다." : null}
          {method === "manual" ? "설정에 맞게 3~20 사이에서 자유롭게 정한다." : null}
        </p>
      </Section>

      <Section title="능력치">
        <div class="ability-table" role="table">
          {ABILITIES.map((ab) => (
            <div class="ability-row" role="row">
              <span class="ability-name" role="cell"><Icon slot={`ability:${ab}`} />{abilityName(ab)}<span class="en">{t(glossary.abilities[ab].abbr, "en")}</span></span>
              <span class="ability-input" role="cell">
                {method === "pointBuy" ? (
                  <span class="stepper">
                    <button type="button" onClick={() => setBase(ab, base[ab] - 1)} disabled={base[ab] <= 8} aria-label={`${abilityName(ab)} 내리기`}>−</button>
                    <span class="num">{base[ab]}</span>
                    <button type="button" onClick={() => setBase(ab, base[ab] + 1)} disabled={base[ab] >= 15 || spent + (POINT_COST[base[ab] + 1] - POINT_COST[base[ab]]) > 27} aria-label={`${abilityName(ab)} 올리기`}>+</button>
                  </span>
                ) : null}
                {method === "standard" ? (
                  <select class="input" value={base[ab]} onChange={(e) => {
                    const v = Number(e.currentTarget.value);
                    const other = ABILITIES.find((o) => o !== ab && base[o] === v);
                    update((s) => ({ ...s, abilities: { ...s.abilities, base: { ...s.abilities.base, [ab]: v, ...(other ? { [other]: base[ab] } : {}) } } }));
                  }}>
                    {STANDARD.map((v) => <option value={v}>{v}</option>)}
                  </select>
                ) : null}
                {method === "manual" ? (
                  <input class="input num-input" type="number" min="3" max="20" value={base[ab]} onInput={(e) => setBase(ab, Math.max(3, Math.min(20, Number(e.currentTarget.value) || 3)))} />
                ) : null}
              </span>
              <span class="ability-final" role="cell">
                <span class="score">{d.scores[ab]}</span>
                <span class="mod">{signed(d.mods[ab])}</span>
              </span>
              <span class="ability-word" role="cell">{t(abilityWord(d.scores[ab]))}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="종족 보너스"
        hint="발더게3처럼 각 보너스를 원하는 능력치로 옮길 수 있다. 한 능력치에 보너스 하나씩."
        aside={<button type="button" class="link-btn" onClick={resetChips}>원래대로</button>}
      >
        {bonus.length ? (
          <div class="bonus-list">
            {bonus.map((chip, i) => (
              <label class="bonus-chip">
                <span class="bonus-amount">+{chip.amount}</span>
                <select class="input" value={chip.ability ?? ""} onChange={(e) => setChip(i, e.currentTarget.value)}>
                  <option value="">능력치 고르기</option>
                  {ABILITIES.map((ab) => <option value={ab}>{abilityName(ab)}</option>)}
                </select>
              </label>
            ))}
          </div>
        ) : <p class="empty">종족을 먼저 고르면 보너스가 나타난다.</p>}
      </Section>
    </>
  );
}

/* ---------- Growth (level choices) ---------- */

export function GrowthStep({ sheet, update }) {
  const cls = getClass(sheet);
  const lvl = levelOf(sheet);
  const [open, setOpen] = useState(1);
  if (!cls) return <p class="empty">직업을 먼저 고르면 레벨마다 고를 것이 나타난다.</p>;
  const sub = getSubclass(cls.id, sheet.class.subclassId);
  return (
    <Section title="성장" hint={`1레벨부터 ${lvl}레벨까지 얻는 능력과 고를 것. 레벨을 내리면 그 위의 선택은 지워진다.`}>
      <ol class="growth">
        {Array.from({ length: lvl }, (_, i) => i + 1).map((L) => {
          const descs = levelChoices(sheet, L);
          const gained = [
            ...(cls.levels[String(L)]?.features ?? []),
            ...(sub?.levels?.[String(L)] ?? []),
          ].map((id) => (sub?.features?.[id] ?? cls.features?.[id] ?? null)).filter(Boolean);
          const commonNames = (cls.levels[String(L)]?.features ?? []).filter((id) => !cls.features?.[id] && !sub?.features?.[id]);
          const isOpen = open === L;
          return (
            <li class={`growth-level${isOpen ? " is-open" : ""}`}>
              <button type="button" class="growth-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? 0 : L)}>
                <span class="growth-num">{L}</span>
                <span class="growth-names">
                  {[
                    L === cls.subclassLevel ? `${t(cls.subclassTitle)}${sub ? `: ${t(sub.name)}` : " 선택"}` : null,
                    ...gained.map((f) => t(f.name)),
                    ...commonNames.map(commonLabel),
                  ].filter(Boolean).join(", ") || "새 능력 없음"}
                </span>
                {descs.length ? <span class="growth-todo">{descs.length}개 선택</span> : null}
              </button>
              {isOpen ? (
                <div class="growth-body">
                  {descs.map((d) => <ChoicePicker sheet={sheet} update={update} desc={d} />)}
                  {!descs.length ? <p class="empty">이 레벨엔 고를 것이 없다.</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

const COMMON_LABELS = { asi: "능력치 향상", extra_attack: "추가 공격", spellcasting: "주문 시전", fighting_style: "전투 방식", expertise: "전문화", evasion: "회피", timeless_body: "시간을 잊은 몸", unarmored_defense_con: "비무장 방어", unarmored_defense_wis: "비무장 방어" };
const commonLabel = (id) => COMMON_LABELS[id] ?? id;

/* ---------- Spells ---------- */

/** Full spell text for the detail panel, with the higher-level note appended. */
function spellDetail(spell) {
  const join = (lang, label) => {
    const body = spell.desc?.[lang];
    if (!body) return null;
    const higher = spell.higherLevel?.[lang];
    return higher ? `${body}\n\n${label} ${higher}` : body;
  };
  const en = join("en", "At higher levels:");
  if (!en) return null;
  return { ko: join("ko", "더 높은 슬롯:"), en };
}

export function SpellStep({ sheet, update }) {
  const budget = spellBudget(sheet);
  const d = derive(sheet);
  const [bg3Only, setBg3Only] = useState(true);
  const [tab, setTab] = useState("cantrips");
  const granted = d.granted;

  if (!budget || budget.maxLevel === 0 && budget.cantrips === 0) {
    return (
      <Section title="주문" hint="이 직업은 주문을 고르지 않는다. 종족이나 하위 직업에서 얻은 주문은 아래에 자동으로 들어간다.">
        <GrantedList granted={granted} />
      </Section>
    );
  }
  const pool = spellChoicePool(sheet);
  const listKey = tab === "cantrips" ? "cantrips" : "known";
  const chosen = sheet.spells[listKey];
  const limit = tab === "cantrips" ? budget.cantrips : budget.spells;
  let list = tab === "cantrips" ? pool.cantrips : pool.spells;
  if (bg3Only) list = list.filter((s) => s.bg3 || chosen.includes(s.id));
  const grantedIds = new Set(granted.map((g) => g.spell.id));
  const allowance = schoolAllowance(sheet);
  const schoolBlocked = (spell) => tab === "spells" && !chosen.includes(spell.id) && !schoolAllows(allowance, spell);
  const toggle = (id) => update((s) => {
    const cur = s.spells[listKey];
    if (!cur.includes(id) && listKey === "known" && !schoolAllows(schoolAllowance(s), spellById[id])) return s;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < limit ? [...cur, id] : cur;
    return { ...s, spells: { ...s.spells, [listKey]: next } };
  });
  const groups = new Map();
  for (const s of list) groups.set(s.level, [...(groups.get(s.level) ?? []), s]);

  return (
    <>
      <Section
        title="주문"
        hint={`${abilityName(budget.ability)} 기반 · ${budget.type === "prepared" ? "준비형: 평소 주로 준비해 두는 주문을 고른다" : "습득형: 익힌 주문을 고른다"} · 최대 ${budget.maxLevel}레벨 주문`}
        aside={<Toggle checked={bg3Only} onChange={setBg3Only} label="발더게3 주문만" />}
      >
        <div class="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "cantrips"} class={tab === "cantrips" ? "is-on" : ""} onClick={() => setTab("cantrips")}>
            소마법 {sheet.spells.cantrips.length}/{budget.cantrips}
          </button>
          <button type="button" role="tab" aria-selected={tab === "spells"} class={tab === "spells" ? "is-on" : ""} onClick={() => setTab("spells")}>
            {budget.type === "prepared" ? "준비 주문" : "주문"} {sheet.spells.known.length}/{budget.spells}
          </button>
        </div>
        {allowance ? (
          <p class={`note${allowance.used > allowance.free ? " is-warn" : ""}`}>
            {allowance.schools.map((x) => schoolName(x)).join("·")} 학파 주문만 배울 수 있다. 3·8·14·20레벨에 하나씩 다른 학파 주문을 고를 수 있다
            (지금 {allowance.used}/{allowance.free}).
            {allowance.used > allowance.free ? " 다른 학파 주문이 너무 많다. 몇 개 빼야 한다." : ""}
          </p>
        ) : null}
        {[...groups.entries()].sort((a, b) => a[0] - b[0]).map(([lv, spellsAtLevel]) => (
          <div class="spell-group">
            <h4 class="sub-title">{lv === 0 ? "소마법" : `${lv}레벨`}</h4>
            <div class="option-grid">
              {spellsAtLevel.map((s) => (
                <Option
                  compact
                  name={s.name}
                  summary={s.summary}
                  desc={spellDetail(s)}
                  badge={grantedIds.has(s.id) ? "자동" : s.bg3 ? null : "발더게3 밖"}
                  selected={chosen.includes(s.id)}
                  note={schoolBlocked(s) ? { ko: "다른 학파 칸을 다 썼다", en: "" } : null}
                  disabled={(!chosen.includes(s.id) && chosen.length >= limit) || grantedIds.has(s.id) || schoolBlocked(s)}
                  onSelect={() => toggle(s.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </Section>
      {granted.length ? (
        <Section title="자동으로 얻는 주문">
          <GrantedList granted={granted} />
        </Section>
      ) : null}
    </>
  );
}

function GrantedList({ granted }) {
  if (!granted.length) return <p class="empty">자동으로 얻는 주문이 없다.</p>;
  return (
    <ul class="granted">
      {granted.map(({ spell, note }) => (
        <li>
          <strong>{t(spell.name)}</strong> <span class="en">{t(spell.name, "en")}</span>
          {note ? <span class="granted-from"> · {t(note)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Profile ---------- */

export function ProfileStep({ sheet, update, settings }) {
  const race = getRace(sheet);
  const bg = getBackground(sheet);
  const p = sheet.profile;
  const setProfile = (patch) => update((s) => ({ ...s, profile: { ...s.profile, ...patch }, profileEn: null }));
  const setAppearance = (id, v) => setProfile({ appearance: { ...p.appearance, [id]: v } });
  const setPersonality = (id, v) => setProfile({ personality: { ...p.personality, [id]: v } });
  const append = (cur, add) => (cur && cur.trim() ? `${cur.trim()}, ${add}` : add);
  const appendLine = (cur, add) => (cur && cur.trim() ? `${cur.trim()}\n${add}` : add);
  const raceChips = (race?.appearanceHints?.examples ?? []).map((ko) => ({ ko, en: ko }));

  return (
    <>
      <Section title="이름">
        <input class="input big" value={p.name} placeholder="모험가의 이름" onInput={(e) => setProfile({ name: e.currentTarget.value })} />
      </Section>

      <Section title="외형" hint={race?.appearanceHints ? `${t(race.name)}: ${t(race.appearanceHints.height)}, ${t(race.appearanceHints.lifespan)}` : "예시를 누르면 칸에 들어간다. 직접 써도 된다."}>
        {raceChips.length ? (
          <div class="chip-row">
            <span class="chip-label">{t(race.name)} 예시</span>
            <Chips items={raceChips} onPick={(c) => setAppearance("marks", append(p.appearance.marks, c.ko))} />
          </div>
        ) : null}
        <div class="form-grid">
          {appearanceFields.map((f) => (
            <div class="field-with-chips">
              <Field label={t(f.label)} en={t(f.label, "en")}>
                <input class="input" value={p.appearance[f.id] ?? ""} onInput={(e) => setAppearance(f.id, e.currentTarget.value)} />
              </Field>
              <Chips items={f.examples} onPick={(c) => setAppearance(f.id, append(p.appearance[f.id], c.ko))} />
            </div>
          ))}
        </div>
        <Field label="그 밖의 외형">
          <textarea class="input" rows="3" value={p.appearance.extra ?? ""} onInput={(e) => setAppearance("extra", e.currentTarget.value)} />
        </Field>
      </Section>

      <Section title="성격" hint={bg ? `${t(bg.name)} 배경의 예시. 🎲를 누르면 하나를 뽑는다.` : "배경을 고르면 그 배경에 맞는 예시가 나온다."}>
        {[["traits", "성격 특성"], ["ideals", "이상"], ["bonds", "유대"], ["flaws", "결점"]].map(([id, label]) => {
          const examples = bg?.examples?.[id] ?? [];
          return (
            <div class="field-with-chips">
              <Field label={label} en={t(glossary.terms[id === "traits" ? "personality_traits" : id], "en")}>
                <textarea class="input" rows="2" value={p.personality[id]} onInput={(e) => setPersonality(id, e.currentTarget.value)} />
              </Field>
              {examples.length ? (
                <div class="chips">
                  <button type="button" class="chip dice" aria-label={`${label} 무작위로 뽑기`} onClick={() => setPersonality(id, appendLine(p.personality[id], examples[Math.floor(Math.random() * examples.length)].ko))}>🎲</button>
                  {examples.map((ex) => (
                    <button type="button" class="chip" onClick={() => setPersonality(id, appendLine(p.personality[id], ex.ko))}>{ex.ko}</button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </Section>

      <Section title="배경 이야기">
        <textarea class="input" rows="7" value={p.backstory} placeholder="어디서 태어나 무엇을 겪고, 왜 길을 나섰는지" onInput={(e) => setProfile({ backstory: e.currentTarget.value })} />
      </Section>

      <AiEditPanel sheet={sheet} update={update} settings={settings} />

      <Section title="그 밖에">
        <Field label="추가 언어" en="Other languages">
          <input class="input" value={p.languagesExtra} placeholder="세계관 고유 언어 등" onInput={(e) => setProfile({ languagesExtra: e.currentTarget.value })} />
        </Field>
        <Field label="메모" en="Notes">
          <textarea class="input" rows="3" value={p.notes} onInput={(e) => setProfile({ notes: e.currentTarget.value })} />
        </Field>
      </Section>
    </>
  );
}

/* ---------- Equipment (used on the finish step) ---------- */

export function EquipmentPicker({ sheet, update }) {
  const d = derive(sheet);
  const armorOk = (a) => d.armorProfs.includes(a.category);
  return (
    <div class="form-grid">
      <Field label="갑옷" en="Armor">
        <select class="input" value={sheet.equipment.armorId ?? ""} onChange={(e) => update((s) => ({ ...s, equipment: { ...s.equipment, armorId: e.currentTarget.value || null } }))}>
          <option value="">입지 않음</option>
          {equipment.armor.map((a) => (
            <option value={a.id}>{t(a.name)} (방어도 {a.ac.base}{a.ac.dexMax === 0 ? "" : a.ac.dexMax ? " + 민첩 최대 2" : " + 민첩"}){armorOk(a) ? "" : " · 숙련 없음"}</option>
          ))}
        </select>
      </Field>
      <Toggle
        checked={sheet.equipment.shield}
        onChange={(v) => update((s) => ({ ...s, equipment: { ...s.equipment, shield: v } }))}
        label="방패"
        hint={d.armorProfs.includes("shield") ? "방어도 +2" : "숙련 없음"}
      />
    </div>
  );
}

export { classFeatures, mod, spellById };

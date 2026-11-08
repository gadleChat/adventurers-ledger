// The ledger page: a running summary that fills in as the player chooses.
import { ABILITIES, abilityName, skillName, t, getSubclass, languageName, spellById } from "../rules/data.js";
import { getRace, getSubrace, getClass, getBackground } from "../rules/sheet.js";
import { signed, abilityWord } from "../rules/calc.js";
import { Icon } from "./Icon.jsx";

export function Ledger({ sheet, d }) {
  const race = getRace(sheet);
  const sub = getSubrace(sheet);
  const cls = getClass(sheet);
  const subclass = cls && getSubclass(cls.id, sheet.class.subclassId);
  const bg = getBackground(sheet);
  const judge = sheet.options.judgementMode;
  const raceName = sheet.race.custom ? sheet.race.custom.name || "이름 없는 종족" : t(sub?.name ?? race?.name);
  const bgName = sheet.background.custom ? sheet.background.custom.name || "직접 만든 배경" : t(bg?.name);
  const profSkills = Object.entries(d.skills).filter(([, s]) => s.prof);
  const spells = [...new Set([...d.granted.map((g) => g.spell.id), ...sheet.spells.cantrips, ...sheet.spells.known])];

  return (
    <article class="ledger" aria-label="명부 미리보기">
      <header class="ledger-head">
        {cls ? <Icon slot={`class:${cls.id}`} class="ledger-crest" /> : null}
        <h2 class={sheet.profile.name ? "" : "is-blank"}>{sheet.profile.name || "이름을 적을 자리"}</h2>
        <p class="ledger-line">
          {[raceName, cls ? `${d.level}레벨 ${t(cls.name)}` : null].filter(Boolean).join(" · ") || "종족과 직업이 여기 적힌다"}
        </p>
        {subclass || bgName ? (
          <p class="ledger-line is-sub">{[t(subclass?.name), bgName ? `${bgName} 출신` : null].filter(Boolean).join(" · ")}</p>
        ) : null}
      </header>

      <div class="ledger-abilities">
        {ABILITIES.map((ab) => (
          <div class="ledger-ability">
            <span class="ledger-ability-name"><Icon slot={`ability:${ab}`} />{abilityName(ab)}</span>
            <span class="ledger-ability-score">{d.scores[ab]}</span>
            <span class="ledger-ability-mod">{judge ? signed(d.mods[ab]) : t(abilityWord(d.scores[ab]))}</span>
          </div>
        ))}
      </div>

      {cls ? (
        <dl class="ledger-stats">
          <div><dt>생명력</dt><dd>{d.hp}</dd></div>
          <div><dt>방어도</dt><dd>{d.ac}</dd></div>
          <div><dt>이동</dt><dd>{d.speed}</dd></div>
          <div><dt>숙련</dt><dd>{signed(d.profBonus)}</dd></div>
        </dl>
      ) : null}

      {profSkills.length ? (
        <section class="ledger-block">
          <h3>숙련 기술</h3>
          <p>{profSkills.map(([id, s]) => `${skillName(id)}${s.expert ? "★" : ""}${judge ? ` ${signed(s.bonus)}` : ""}`).join(", ")}</p>
        </section>
      ) : null}

      {d.languages.length ? (
        <section class="ledger-block">
          <h3>언어</h3>
          <p>{d.languages.map((l) => languageName(l)).join(", ")}{sheet.profile.languagesExtra ? `, ${sheet.profile.languagesExtra}` : ""}</p>
        </section>
      ) : null}

      {d.raceTraits.length || d.classFeatures.length ? (
        <section class="ledger-block">
          <h3>능력과 특성</h3>
          <p>
            {[
              ...d.raceTraits.map((tr) => t(tr.name)),
              ...d.classFeatures.map((f) => t(f.feature.name)),
              ...d.subclassFeatures.map((f) => t(f.feature.name)),
              ...d.feats.map((f) => t(f.name)),
              ...d.pickedOptions.map((o) => t(o.item.name)),
            ].filter(Boolean).join(", ")}
          </p>
        </section>
      ) : null}

      {spells.length ? (
        <section class="ledger-block">
          <h3>주문</h3>
          <p>{spells.map((id) => t(spellById[id]?.name)).filter(Boolean).join(", ")}</p>
        </section>
      ) : null}
    </article>
  );
}

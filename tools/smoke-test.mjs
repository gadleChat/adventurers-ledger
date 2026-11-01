// Smoke test for the rules engine: builds sheets for every race, class, and
// subclass at levels 1-20, fills every choice automatically, and checks that
// derive(), allChoices(), and buildPersonaText() run without errors.
//
// Usage: node tools/smoke-test.mjs

import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const buildFile = readFileSync(join(root, "build.mjs"), "utf8");
// Reuse the data collection from build.mjs by evaluating only what we need.
const { collectData } = await import("data:text/javascript," + encodeURIComponent(
  buildFile
    .replace(/^import \{ build \} from "esbuild";$/m, "")
    .replace(/const root = .*$/m, `const root = ${JSON.stringify(root)};`)
    .replace(/const result = await build\([\s\S]*$/m, "export { collectData };"),
));

const entry = `
import { races, classes, feats } from "./src/rules/data.js";
import { newSheet, setRace, setClass, setLevel, setChoice, setBackground } from "./src/rules/sheet.js";
import { allChoices } from "./src/rules/choices.js";
import { derive, spellBudget, spellChoicePool } from "./src/rules/calc.js";
import { buildPersonaText } from "./src/rules/export.js";

function fill(sheet) {
  for (let pass = 0; pass < 4; pass += 1) {
    for (const d of allChoices(sheet)) {
      if (d.kind === "subclass") continue;
      if (d.kind === "text") { sheet = setChoice(sheet, d, "test"); continue; }
      if (d.kind === "asiOrFeat") {
        sheet = setChoice(sheet, d, pass % 2 ? { type: "feat", featId: "resilient" } : { type: "asi", increases: { str: 1, dex: 1 } });
        continue;
      }
      const opts = d.options.filter((o) => !o.disabled).map((o) => o.id);
      sheet = setChoice(sheet, d, opts.slice(0, d.count));
    }
  }
  return sheet;
}

export function run() {
  let count = 0;
  const problems = [];
  for (const cls of classes) {
    for (const sub of cls.subclasses) {
      for (const race of races) {
        const subrace = race.subraces[0]?.id ?? null;
        let s = setBackground(setRace(newSheet(), race.id, subrace), "sage");
        s = setClass(s, cls.id);
        s = setLevel(s, 20);
        s = { ...s, class: { ...s.class, subclassId: sub.id } };
        s.abilities.bonus = s.abilities.bonus.map((c, i) => ({ ...c, ability: c.ability ?? ["str","dex","con","int","wis","cha"][i] }));
        try {
          s = fill(s);
          const budget = spellBudget(s);
          if (budget) {
            const pool = spellChoicePool(s);
            s.spells.cantrips = pool.cantrips.slice(0, budget.cantrips).map((x) => x.id);
            s.spells.known = pool.spells.slice(0, budget.spells).map((x) => x.id);
          }
          for (const lvl of [1, 3, 20]) {
            const at = setLevel(s, lvl);
            const d = derive(at);
            if (!Number.isFinite(d.hp) || !Number.isFinite(d.ac)) problems.push(cls.id + "/" + sub.id + "/" + race.id + " L" + lvl + ": bad hp/ac");
            buildPersonaText(at, d, "en");
            buildPersonaText({ ...at, options: { judgementMode: true } }, d, "ko");
          }
          count += 1;
        } catch (e) {
          problems.push(cls.id + "/" + sub.id + "/" + race.id + ": " + e.stack.split("\\n").slice(0, 3).join(" | "));
        }
      }
    }
  }
  return { count, problems };
}
`;

const out = await build({
  stdin: { contents: entry, resolveDir: root, loader: "js" },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [{
    name: "virtual-data",
    setup(b) {
      b.onResolve({ filter: /^virtual:data$/ }, () => ({ path: "data", namespace: "virtual" }));
      b.onLoad({ filter: /.*/, namespace: "virtual" }, () => ({ contents: `export default ${JSON.stringify(collectData())};`, loader: "js" }));
    },
  }],
});

const mod = await import("data:text/javascript," + encodeURIComponent(out.outputFiles[0].text));
const { count, problems } = mod.run();
if (problems.length) {
  console.log(problems.slice(0, 20).join("\n"));
  console.log(`${problems.length} problem(s) in ${count} combinations`);
  process.exit(1);
}
console.log(`OK: ${count} race/class/subclass combinations at levels 1, 3, 20`);

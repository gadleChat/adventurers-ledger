// Build the RisuAI plugin into a single file: dist/adventurers-ledger.js
//
// All game data under data/ is bundled into the plugin through the virtual
// module "virtual:data", so the plugin works offline.

import { build } from "esbuild";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dataDir = join(root, "data");

const readJson = (...parts) => JSON.parse(readFileSync(join(dataDir, ...parts), "utf8"));

function folder(name) {
  const out = {};
  for (const file of readdirSync(join(dataDir, name))) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    out[file.replace(/\.json$/, "")] = readJson(name, file);
  }
  return out;
}

function collectData() {
  const spells = readJson("spells", "spells.json").spells;
  return {
    glossary: readJson("glossary.json"),
    raceOrder: readJson("races", "_index.json").order,
    races: folder("races"),
    classOrder: readJson("classes", "_index.json").order,
    classes: folder("classes"),
    subclasses: folder("subclasses"),
    lists: folder("lists"),
    spells,
    backgrounds: readJson("backgrounds", "backgrounds.json"),
    feats: readJson("feats.json").items,
    equipment: readJson("equipment.json"),
    appearance: readJson("appearance.json").fields,
  };
}

const dataPlugin = {
  name: "virtual-data",
  setup(b) {
    b.onResolve({ filter: /^virtual:data$/ }, () => ({ path: "data", namespace: "virtual" }));
    b.onLoad({ filter: /.*/, namespace: "virtual" }, () => ({
      contents: `export default ${JSON.stringify(collectData())};`,
      loader: "js",
    }));
  },
};

const header = [
  "//@name gadlechat_adventurers_ledger",
  "//@display-name 모험가 명부",
  "//@api 3.0",
  `//@version ${pkg.version}`,
  "//@update-url https://raw.githubusercontent.com/gadleChat/adventurers-ledger/main/dist/adventurers-ledger.js",
  "//@link https://github.com/gadleChat/adventurers-ledger 저장소",
  "",
].join("\n");

const result = await build({
  entryPoints: [join(root, "src", "main.jsx")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  target: "es2020",
  charset: "utf8",
  jsx: "automatic",
  jsxImportSource: "preact",
  loader: { ".css": "text" },
  define: { __VERSION__: JSON.stringify(pkg.version) },
  plugins: [dataPlugin],
});

const code = header + result.outputFiles[0].text;
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "adventurers-ledger.js"), code);
console.log(`Built dist/adventurers-ledger.js (${Math.round(code.length / 1024)} KB, v${pkg.version})`);

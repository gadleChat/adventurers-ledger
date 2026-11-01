// Test helper: bundles a snippet that imports from src/ with the game data
// injected as "virtual:data", then imports it as a module.

import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

async function loadCollectData() {
  const source = readFileSync(join(root, "build.mjs"), "utf8")
    .replace(/^import \{ build \} from "esbuild";$/m, "")
    .replace(/const root = .*$/m, `const root = ${JSON.stringify(root)};`)
    .replace(/const result = await build\([\s\S]*$/m, "export { collectData };");
  return (await import("data:text/javascript," + encodeURIComponent(source))).collectData;
}

export async function loadRules(entrySource) {
  const collectData = await loadCollectData();
  const out = await build({
    stdin: { contents: entrySource, resolveDir: root, loader: "js" },
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
  return import("data:text/javascript," + encodeURIComponent(out.outputFiles[0].text));
}

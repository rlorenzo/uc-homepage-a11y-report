import { readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transform } from "lightningcss";

const file = fileURLToPath(new URL("../site/assets/style.css", import.meta.url));

const before = statSync(file).size;
const { code } = transform({
  filename: "style.css",
  code: readFileSync(file),
  minify: true,
  sourceMap: false,
});
writeFileSync(file, code);
const after = code.length;

const pct = ((1 - after / before) * 100).toFixed(1);
console.log(`minified ${file}: ${before} → ${after} bytes (-${pct}%)`);

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transform } from "lightningcss";

// This transform is destructive: it overwrites the checked-in, readable
// style.css in place. That's correct in CI — Cloudflare Workers Builds and
// the Pages workflows minify an ephemeral checkout just before upload — but
// a local run would dirty the working tree with a one-line minified file
// that could be committed by accident. Refuse outside CI unless forced.
if (!process.env.CI && !process.argv.includes("--force")) {
  console.error(
    "minify-css rewrites site/assets/style.css in place and is meant for CI builds.\n" +
      "Pass --force to run it locally anyway (this will dirty your working tree).",
  );
  process.exit(1);
}

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

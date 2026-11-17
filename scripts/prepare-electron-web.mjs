/**
 * After `npm run build`, copy client files into `electron-web/` for electron-builder.
 * TanStack Start + Nitro (Vercel) → `.vercel/output/static`
 */
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "electron-web");

const candidates = [
  join(root, ".vercel", "output", "static"),
  join(root, "dist", "client"),
  join(root, ".output", "public"),
  join(root, "dist"),
  join(root, "build", "client"),
  join(root, "build"),
];

function hasIndex(dir) {
  return existsSync(join(dir, "index.html"));
}

function hasAssets(dir) {
  return existsSync(join(dir, "assets"));
}

let source = null;
for (const dir of candidates) {
  if (existsSync(dir) && (hasIndex(dir) || hasAssets(dir))) {
    source = dir;
    break;
  }
}

if (!source) {
  console.error("Could not find build output.");
  console.error("Checked:\n  " + candidates.join("\n  "));
  process.exit(1);
}

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(source, out, { recursive: true });

const indexPath = join(out, "index.html");
if (!existsSync(indexPath)) {
  const assetsDir = join(out, "assets");
  let mainJs = "";
  let mainCss = [];
  if (existsSync(assetsDir)) {
    for (const name of readdirSync(assetsDir)) {
      if (/^index-.*\.js$/.test(name) && !mainJs) mainJs = `./assets/${name}`;
      if (/^(styles|index)-.*\.css$/.test(name)) mainCss.push(`./assets/${name}`);
    }
  }
  if (!mainJs) {
    console.error("No index-*.js in assets/. Cannot make index.html");
    process.exit(1);
  }
  const cssLinks = mainCss.map((href) => `  <link rel="stylesheet" href="${href}" />`).join("\n");
  writeFileSync(
    indexPath,
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BeerFlow POS</title>
  <meta name="theme-color" content="#141210" />
${cssLinks}
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${mainJs}"></script>
</body>
</html>
`,
    "utf8",
  );
  console.log("Generated index.html ->", mainJs);
}

console.log("OK:", source, "-> electron-web/");
console.log("index.html:", existsSync(indexPath));
console.log("files:", readdirSync(out).slice(0, 12).join(", "));

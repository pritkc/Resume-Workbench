import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "website");
const output = resolve(root, "dist/pages");

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "assets"), { recursive: true });

await Promise.all([
  cp(resolve(source, "index.html"), resolve(output, "index.html")),
  cp(resolve(source, "styles.css"), resolve(output, "styles.css")),
  cp(resolve(source, "script.js"), resolve(output, "script.js")),
  cp(
    resolve(root, "apps/frontend/public/logo.svg"),
    resolve(output, "assets/logo.svg"),
  ),
  cp(
    resolve(root, "apps/frontend/public/showcase/builder.png"),
    resolve(output, "assets/builder.png"),
  ),
  writeFile(resolve(output, ".nojekyll"), ""),
]);

const html = await readFile(resolve(output, "index.html"), "utf8");
const requiredReferences = [
  "./styles.css",
  "./script.js",
  "./assets/logo.svg",
  "./assets/builder.png",
];

for (const reference of requiredReferences) {
  if (!html.includes(reference)) {
    throw new Error(`Missing required page reference: ${reference}`);
  }
}

if (/\b(?:href|src)="\/(?!\/)/.test(html)) {
  throw new Error(
    "Root-relative page assets are not allowed because this site is hosted under a GitHub project path.",
  );
}

for (const file of [
  "index.html",
  "styles.css",
  "script.js",
  "assets/logo.svg",
  "assets/builder.png",
  ".nojekyll",
]) {
  await stat(resolve(output, file));
}

console.log(`GitHub Pages website built at ${output}`);

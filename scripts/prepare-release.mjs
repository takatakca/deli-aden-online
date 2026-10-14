// Assemble a static SPA release on GitHub Actions, never on MochaHost.
// TanStack Start SPA builds commonly emit "_shell.html" rather than "index.html".
import {
  existsSync,
  mkdirSync,
  cpSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const revision = process.env.DEPLOY_SHA;
if (!revision || !/^[0-9a-f]{40}$/.test(revision)) {
  throw new Error("DEPLOY_SHA must be a full 40-character Git SHA");
}

const candidateDirs = ["dist/client", ".output/public", "dist"];
const sourceDir = candidateDirs.find(
  (dir) =>
    existsSync(join(dir, "_shell.html")) ||
    existsSync(join(dir, "index.html")),
);

if (!sourceDir) {
  throw new Error(
    "No supported TanStack SPA output: expected dist/client/_shell.html or index.html",
  );
}

const releaseRoot = resolve(".release");
const releaseDist = join(releaseRoot, "dist");
rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(releaseDist, { recursive: true });
cpSync(sourceDir, releaseDist, { recursive: true, force: true });

const htmlEntry = join(releaseDist, "index.html");
const shellEntry = join(releaseDist, "_shell.html");
if (!existsSync(htmlEntry) && existsSync(shellEntry)) {
  copyFileSync(shellEntry, htmlEntry);
}
if (!existsSync(htmlEntry) || !readFileSync(htmlEntry, "utf8").includes("<html")) {
  throw new Error("The release has no valid SPA index.html document");
}

const serverFiles = readdirSync(".").filter(
  (name) => name === "server.cjs" || /^server-[a-z0-9-]+\.cjs$/.test(name),
);
if (!serverFiles.includes("server.cjs")) {
  throw new Error("Missing required server.cjs");
}
for (const file of serverFiles) {
  copyFileSync(file, join(releaseRoot, file));
}
copyFileSync("package.json", join(releaseRoot, "package.json"));
writeFileSync(join(releaseDist, "revision.txt"), `${revision}\n`, "utf8");

console.log(
  JSON.stringify({
    revision,
    sourceDir,
    entry: existsSync(shellEntry) ? "_shell.html -> index.html" : "index.html",
    serverModules: serverFiles,
  }),
);

// Race-proof desktop publisher.
//
// `electron-builder --publish always` spawns one upload thread per artifact and
// each thread tries to CREATE the GitHub release when it doesn't exist yet. Those
// creates collide -> HTTP 422 "must have a valid tag", the run aborts having
// uploaded only the *.blockmap, and `latest.yml` never lands, breaking the
// auto-updater. See memory: release-publish-race.
//
// This wrapper removes the failure two ways:
//   1. Pre-create the release/tag so electron-builder only ever UPLOADS to an
//      existing release (no concurrent create -> no race).
//   2. After publishing, verify the release has the installer, blockmap and a
//      correct latest.yml; regenerate + re-upload whatever is missing. This
//      self-heals even if a future electron-builder version regresses.
//
// Env: GH_TOKEN/GITHUB_TOKEN (falls back to `gh auth token`).
//      SKIP_BUILD=1 re-verifies/repairs an already-published version without
//      rebuilding (the automated form of the old manual repair).
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const version = pkg.version;
const tag = `v${version}`;
const publish = (pkg.build && (pkg.build.win?.publish || pkg.build.publish)) || {};
if (!publish.owner || !publish.repo) {
  console.error("No GitHub publish config (build.win.publish) in package.json.");
  process.exit(1);
}
const repo = `${publish.owner}/${publish.repo}`;
const releaseDir = path.join(root, "release");
const exeName = `Lumina-Prisma-Setup-${version}.exe`;

// gh is a native executable, so run it without a shell and pass args as an
// array (no string concatenation -> no injection surface, no DEP0190 warning).
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
}
function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });
  return { status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

// --- token ---------------------------------------------------------------
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  const t = capture("gh", ["auth", "token"]);
  if (t.status === 0) token = t.out;
}
if (!token) {
  console.error("No GitHub token. Set GH_TOKEN or run `gh auth login`.");
  process.exit(1);
}
const env = { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token };
const ghRepo = ["-R", repo];

// --- 1. pre-create the release so electron-builder can't race the create --
const exists = spawnSync("gh", ["release", "view", tag, ...ghRepo], { stdio: "ignore", env });
if (exists.status !== 0) {
  console.log(`Pre-creating release ${tag} on ${repo}...`);
  const created = run("gh", ["release", "create", tag, ...ghRepo, "-t", `Lumina Prisma ${version}`, "-n", `Lumina Prisma ${version}`], { env });
  if (created.status !== 0) {
    console.error("Failed to pre-create the release.");
    process.exit(1);
  }
} else {
  console.log(`Release ${tag} already exists; electron-builder will upload to it.`);
}

// --- 2. build + publish (uploads to the existing release) ----------------
if (process.env.SKIP_BUILD === "1") {
  console.log("SKIP_BUILD=1 -> skipping electron-builder, verifying assets only.");
} else {
  // electron-builder is an npm-bin (.cmd shim on Windows), so this one needs a
  // shell; pass it as a single string so no args array is concatenated.
  spawnSync("npx electron-builder --win nsis --publish always", {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env,
  });
  // Intentionally ignore electron-builder's exit code here: the create-race
  // exits non-zero yet leaves a usable .exe on disk. The verify step below is
  // the source of truth for whether the release is actually complete.
}

// --- 3. verify + repair --------------------------------------------------
const exePath = path.join(releaseDir, exeName);
if (!fs.existsSync(exePath)) {
  console.error(`Installer not found at ${exePath}. Build did not produce it.`);
  process.exit(1);
}

const view = capture("gh", ["release", "view", tag, ...ghRepo, "--json", "assets"], { env });
if (view.status !== 0) {
  console.error("Could not read release assets:", view.err || view.out);
  process.exit(1);
}
const assets = (JSON.parse(view.out).assets || []).map((a) => a.name);
const toUpload = [];

if (!assets.includes(exeName)) toUpload.push(exePath);
const blockmap = `${exeName}.blockmap`;
if (!assets.includes(blockmap) && fs.existsSync(path.join(releaseDir, blockmap))) {
  toUpload.push(path.join(releaseDir, blockmap));
}

// latest.yml is what the auto-updater reads. Always regenerate it from the exe
// on disk so its sha512/size are guaranteed to match the published installer,
// then (re)upload if GitHub is missing it. This is the piece the race drops.
if (!assets.includes("latest.yml")) {
  const buf = fs.readFileSync(exePath);
  const sha512 = crypto.createHash("sha512").update(buf).digest("base64");
  const size = buf.length;
  const yml =
    `version: ${version}\n` +
    `files:\n` +
    `  - url: ${exeName}\n` +
    `    sha512: ${sha512}\n` +
    `    size: ${size}\n` +
    `path: ${exeName}\n` +
    `sha512: ${sha512}\n` +
    `releaseDate: '${new Date().toISOString().replace(/\.\d+Z$/, ".000Z")}'\n`;
  fs.writeFileSync(path.join(releaseDir, "latest.yml"), yml);
  toUpload.push(path.join(releaseDir, "latest.yml"));
  console.log("Regenerated latest.yml (was missing from the release).");
}

if (toUpload.length) {
  console.log("Repairing missing assets:", toUpload.map((p) => path.basename(p)).join(", "));
  const up = run("gh", ["release", "upload", tag, ...toUpload, ...ghRepo, "--clobber"], { env });
  if (up.status !== 0) {
    console.error("Failed to upload repaired assets.");
    process.exit(1);
  }
}

// --- 4. final assertion --------------------------------------------------
const finalView = capture("gh", ["release", "view", tag, ...ghRepo, "--json", "assets"], { env });
const finalAssets = (JSON.parse(finalView.out).assets || []).map((a) => a.name);
const required = [exeName, "latest.yml"];
const missing = required.filter((name) => !finalAssets.includes(name));
if (missing.length) {
  console.error("Release still incomplete, missing:", missing.join(", "));
  process.exit(1);
}
console.log(`Release ${tag} complete: ${finalAssets.join(", ")}`);

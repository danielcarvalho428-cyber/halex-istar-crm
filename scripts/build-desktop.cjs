// Production build for the packaged desktop app.
//
// The /license-admin route is a vendor-only Firebase console. Keeping it in the
// repo lets us run it locally with `npm run dev`, but we must NOT ship it to
// customers: it would trace the whole Firebase SDK (~159 MB) into the packaged
// Next server for a page customers can never use. So we move the route out of
// the app tree, run `next build`, then always restore it — leaving the shipped
// standalone free of that route and its dependencies.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const routeDir = path.join(root, "src", "app", "license-admin");
// Park it outside src/app so Next's compiler never sees it during the build.
const parkedDir = path.join(root, ".license-admin.parked");

function restore() {
  if (fs.existsSync(parkedDir)) {
    fs.rmSync(routeDir, { recursive: true, force: true });
    fs.renameSync(parkedDir, routeDir);
  }
}

// Guard against a leftover parked copy from an interrupted previous run.
if (fs.existsSync(parkedDir) && !fs.existsSync(routeDir)) {
  restore();
}

const hasRoute = fs.existsSync(routeDir);
if (hasRoute) {
  fs.rmSync(parkedDir, { recursive: true, force: true });
  fs.renameSync(routeDir, parkedDir);
  process.stdout.write("Excluding /license-admin from the desktop build.\n");
}

let code = 1;
try {
  const result = spawnSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  code = result.status == null ? 1 : result.status;
} finally {
  if (hasRoute) {
    restore();
    process.stdout.write("Restored /license-admin for local development.\n");
  }
}

process.exit(code);

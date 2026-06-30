const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error("Standalone Next build not found. Run npm run build first.");
}

const staticTarget = path.join(standalone, ".next", "static");
fs.rmSync(staticTarget, { recursive: true, force: true });
fs.cpSync(path.join(root, ".next", "static"), staticTarget, {
  recursive: true,
});

const publicTarget = path.join(standalone, "public");
fs.rmSync(publicTarget, { recursive: true, force: true });
fs.cpSync(path.join(root, "public"), publicTarget, { recursive: true });
process.stdout.write("Desktop resources prepared.\n");

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repository = process.cwd();
const scope = "tanweejoe-7327s-projects";
const env = {
  ...process.env,
  VERCEL_ORG_ID: "team_JWMbuTaY6WlhXexaaaT30fRi",
  VERCEL_PROJECT_ID: "prj_Qe9g642l7HcpdXv48o7niDR1yOYn",
};

function run(command, args, cwd = repository) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error?.code === "ENOENT" && command === "vercel") {
    throw new Error("Install Vercel CLI with: npm install --global vercel@65.5.0; then run vercel login.");
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed; deployment stopped.`);
}

let temporary;
let checkout;
let worktreeAdded = false;
try {
  // Authenticate before installing/building anything. Reuses the local CLI login.
  run("vercel", ["whoami", "--scope", scope]);
  run("git", ["fetch", "origin", "main"]);
  temporary = mkdtempSync(path.join(tmpdir(), "dayquest-deploy-"));
  checkout = path.join(temporary, "checkout");
  run("git", ["worktree", "add", "--detach", checkout, "origin/main"]);
  worktreeAdded = true;
  run("git", ["log", "-1", "--format=Deploying committed main: %h %s"], checkout);
  run("npm", ["ci"], checkout);
  run("npm", ["run", "typecheck"], checkout);
  run("npm", ["test"], checkout);
  // Vercel performs the production build with its server-side environment values.
  run("vercel", ["deploy", "--prod", "--yes", "--scope", scope], checkout);
  console.log("Production: https://dayquest-pi.vercel.app");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Deployment failed.");
  process.exitCode = 1;
} finally {
  let cleaned = true;
  if (worktreeAdded) {
    const result = spawnSync("git", ["worktree", "remove", "--force", checkout], { cwd: repository, stdio: "inherit" });
    cleaned = result.status === 0;
  }
  if (temporary && cleaned) rmSync(temporary, { recursive: true, force: true });
  if (!cleaned) console.error(`Temporary checkout could not be removed: ${checkout}`);
}

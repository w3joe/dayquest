// One live run of the world builder (real models) on the offline preview scene. Prints the trace and the resulting design.
//   npx tsx scripts/direct-world-live.mts [street|park|plaza] [YYYY-MM-DD]
import { mockScenePlan } from "../pipeline/scene-plan";
import { buildWorldContext } from "../pipeline/world-context";
import { agentsRunner, directWorld } from "../pipeline/world-director";
import { simulateWorld } from "../pipeline/world-sim";

try { process.loadEnvFile(".env"); } catch { /* key may already be set */ }
const ground = (process.argv[2] as "street" | "park" | "plaza") || "street", date = process.argv[3] || "2026-11-07";
const blueprint = mockScenePlan({ landmark: Buffer.from("x"), lunch: Buffer.from("x") });
blueprint.ground = ground;
const ctx = buildWorldContext(blueprint, { name: "Sam", date }, { weather: { condition: "rain", tempC: 9 } });
const started = Date.now();
const run = await directWorld(ctx, agentsRunner(), { simulate: (d) => simulateWorld(blueprint, d) });
console.log(`source=${run.source}  total=${((Date.now() - started) / 1000).toFixed(1)}s`);
for (const t of run.trace) console.log(`  ${t.agent.padEnd(9)} ${String(t.ms).padStart(6)}ms  ${t.model ?? ""}  ${t.summary}${t.issues ? "\n      - " + t.issues.join("\n      - ") : ""}`);
console.log(JSON.stringify({ brief: run.brief, design: run.design }, null, 1));

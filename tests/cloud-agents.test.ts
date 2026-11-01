import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { runCloudAgent } from "../pipeline/cloud-agents";

const schema = z.object({ mood: z.string(), cautions: z.array(z.string()) });
const payload = { mood: "quiet rain", cautions: ["do not name the cafe"] };

function fakeClient(opts: {
  artifact?: string;
  parsed?: unknown;
  text?: string;
  onCreate?: (body: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
}) {
  const stream = {
    withResultCollection() { return this; },
    async *[Symbol.asyncIterator]() { yield { type: "agent.session.created", session_id: "sess_test" }; },
    async finalResult() {
      return { session_id: "sess_test", turn_id: "turn_test", output_text: opts.text ?? "", output_parsed: opts.parsed };
    },
    controller: { abort() {} },
  };
  return {
    beta: {
      agents: {
        sessions: {
          create: async (body: Record<string, unknown>) => { opts.onCreate?.(body); return stream; },
          delete: async (id: string) => { opts.onDelete?.(id); },
          artifacts: {
            forResult() {
              return {
                content: async () => {
                  if (opts.artifact === undefined) throw new Error("missing artifact");
                  return new Response(opts.artifact);
                },
              };
            },
          },
        },
      },
    },
  } as never;
}

test("hosted session writes a sandbox artifact and is deleted afterwards", async () => {
  const deleted: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const out = await runCloudAgent({
    name: "Scene brief", instructions: "Write a brief.", input: "{\"place\":\"a corner cafe\"}", schema, model: "gpt-6-astra",
  }, fakeClient({ artifact: JSON.stringify(payload), onCreate: body => bodies.push(body), onDelete: id => deleted.push(id) }));
  assert.deepEqual(out, payload);
  assert.deepEqual(deleted, ["sess_test"]);
  const body = bodies[0];
  const environment = body.environment as { type: string; container_size: string; network: { access: string } };
  assert.equal(environment.type, "openai_hosted");
  assert.equal(environment.container_size, "small");
  assert.equal(environment.network.access, "disabled");
  assert.equal(body.stream, true);
});

test("place research turns the sandbox network and web search on", async () => {
  let body: Record<string, unknown> | undefined;
  await runCloudAgent({
    name: "Place researcher", instructions: "Research the place.", input: "{}", schema, model: "gpt-6-astra", webSearch: true,
  }, fakeClient({ artifact: JSON.stringify(payload), onCreate: value => { body = value; } }));
  const environment = body!.environment as { network: { access: string } };
  const agent = body!.agent as { tools: { type: string }[] };
  assert.equal(environment.network.access, "enabled");
  assert.deepEqual(agent.tools, [{ type: "web_search" }]);
});

test("structured session output is used when no artifact is published", async () => {
  const out = await runCloudAgent({
    name: "Scene brief", instructions: "Write a brief.", input: "{}", schema, model: "gpt-6-astra",
  }, fakeClient({ parsed: payload }));
  assert.deepEqual(out, payload);
});

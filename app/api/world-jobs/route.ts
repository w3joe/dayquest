import { after } from "next/server";
import { isReadyDraft, parseDraft } from "@/lib/draft";
import { errorResponse, RequestError } from "@/lib/server/errors";
import { prepareWorldJob } from "@/lib/server/world-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Each poll advances inventory, a batch of up to three sprites, or publication after responding. */
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 32 * 1024) throw new RequestError("World request is too large.", 413);
    const raw = await request.json().catch(() => null);
    const draft = parseDraft(raw);
    if (!isReadyDraft(draft)) throw new RequestError("Return to Today and finish your character before creating your world.");
    const { job, run } = await prepareWorldJob(draft, raw?.retry === true);
    if (run) after(run);
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

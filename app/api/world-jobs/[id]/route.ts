import { getWorldJob } from "@/lib/server/world-jobs";
import { errorResponse, RequestError } from "@/lib/server/errors";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const job = await getWorldJob((await params).id);
    if (!job) throw new RequestError("This world build was not found.", 404);
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export const runtime = "nodejs";

/** Retired demo-driven stream. Production uses the resumable photo-world jobs. */
export async function POST(_request: Request) {
  return Response.json({ error: "This generation endpoint has been retired. Use POST /api/world-jobs with your ready photo draft to create and resume your world." },
    { status: 410, headers: { "Cache-Control": "no-store" } });
}

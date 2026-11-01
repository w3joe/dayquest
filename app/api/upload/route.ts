import { errorResponse } from "@/lib/server/errors";
import { readPhotoForm, sanitizePhoto, validateKind, validateSessionId } from "@/lib/server/photos";
import { storeSessionAsset } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await readPhotoForm(request);
    const sessionId = validateSessionId(form.get("sessionId"));
    const kind = validateKind(form.get("kind"));
    const photo = await sanitizePhoto(form.get("photo"));
    const url = await storeSessionAsset(sessionId, kind, photo);
    return Response.json({ url });
  } catch (error) {
    return errorResponse(error);
  }
}

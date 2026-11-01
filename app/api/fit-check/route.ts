import { generateCharacter } from "@/lib/server/character";
import { errorResponse, RequestError } from "@/lib/server/errors";
import { readPhotoForm, sanitizePhoto, validateSessionId } from "@/lib/server/photos";
import { storeSessionAsset } from "@/lib/server/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new RequestError("Character generation is not configured. Set OPENAI_API_KEY on the server.", 503);
    }
    if (process.env.NODE_ENV === "production" && !process.env.BLOB_READ_WRITE_TOKEN) {
      throw new RequestError("Photo storage is not configured. Set BLOB_READ_WRITE_TOKEN on the server.", 503);
    }
    const form = await readPhotoForm(request);
    const sessionId = validateSessionId(form.get("sessionId"));
    const front = await sanitizePhoto(form.get("photo"));
    const backPhoto = form.get("backPhoto");
    const back = backPhoto ? await sanitizePhoto(backPhoto) : undefined;
    const sprite = await generateCharacter(front, back);
    const spriteUrl = await storeSessionAsset(sessionId, "player", sprite);
    return Response.json({ spriteUrl });
  } catch (error) {
    return errorResponse(error);
  }
}

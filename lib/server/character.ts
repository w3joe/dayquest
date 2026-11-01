import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { RequestError } from "./errors";
import { ISOLATED_OBJECT } from "../art-style";
import { safeOpenAIError } from "./openai-errors";

export const CHARACTER_PROMPT = `${ISOLATED_OBJECT} A single chibi character seen directly from BEHIND (back view, face not visible), full body, standing, matching this person's clothing, colours, hairstyle and hair colour, and skin tone exactly. Neutral pose, arms at sides. Leave clear transparent space around the complete character including their shoes.`;

export async function pixelateCharacter(bytes: Buffer): Promise<Buffer> {
  const source = sharp(bytes, { limitInputPixels: 20_000_000 });
  const metadata = await source.metadata();
  if (!metadata.hasAlpha) throw new RequestError("The generated sprite was missing transparency. Please retry.", 502);
  const { data: original, info: originalInfo } = await source.clone().toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = false;
  let transparent = false;
  for (let i = 3; i < original.length; i += originalInfo.channels) {
    visible ||= original[i] >= 128;
    transparent ||= original[i] < 128;
  }
  if (!visible || !transparent) throw new RequestError("The generated sprite did not have a usable transparent background. Please retry.", 502);
  const { data, info } = await source.trim({ background: "#00000000", threshold: 1 })
    .resize(32, 48, { fit: "contain", kernel: "nearest", background: "#00000000" })
    .toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += info.channels) data[i] = data[i] < 128 ? 0 : 255;
  return sharp(data, { raw: { width: 32, height: 48, channels: 4 } })
    // PNG supports 1/2/4/8-bit palettes. In this sharp build, asking for 32
    // rounds up to 8 bits (256 colours); 16 keeps the output within our ≤32 cap.
    .png({ palette: true, colours: 16, dither: 0 }).toBuffer();
}

export async function generateCharacter(front: Buffer, back?: Buffer): Promise<Buffer> {
  if (!process.env.OPENAI_API_KEY) {
    throw new RequestError("Character generation is not configured. Set OPENAI_API_KEY on the server.", 503);
  }
  const client = new OpenAI({ timeout: 110_000, maxRetries: 0 });
  try {
    const image = [await toFile(front, "fit-front.png", { type: "image/png" })];
    if (back) image.push(await toFile(back, "fit-back.png", { type: "image/png" }));
    const result = await client.images.edit({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
      image,
      prompt: CHARACTER_PROMPT,
      background: "transparent",
      output_format: "png",
      size: "1024x1024",
      quality: "medium",
      n: 1,
    });
    const encoded = result.data?.[0]?.b64_json;
    if (!encoded) throw new RequestError("Character generation returned no image. Please retry.", 502);
    return await pixelateCharacter(Buffer.from(encoded, "base64"));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (error instanceof OpenAI.APIError) {
      const safe = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : undefined;
      // Provider bodies may include photos/prompts; log only diagnostic identifiers.
      console.error("Fit-check image service failed", { status: error.status, code: safe(error.code), parameter: safe(error.param), requestId: safe(error.requestID), type: safe(error.name) });
    }
    throw safeOpenAIError(error, "Character generation");
  }
}

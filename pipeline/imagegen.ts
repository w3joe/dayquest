import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { ISOLATED_OBJECT } from "@/lib/art-style";

/** Identical on every call; this is what keeps scenes consistent (§5.3). */
export const STYLE_PREFIX = ISOLATED_OBJECT;

const SIZE_WORDS = { S: "small", M: "medium", L: "large" } as const;

export function landmarkPrompt(name: string, footprint: "S" | "M" | "L", note?: string): string {
  return `${STYLE_PREFIX} A ${SIZE_WORDS[footprint]} building/object sprite of ${name}, simplified and recognisable.${note ? ` ${note}` : ""}`;
}
export function foodPrompt(food: string): string {
  return `${STYLE_PREFIX} A small item icon of ${food}, viewed from slightly above.`;
}
export function playerPrompt(): string {
  return `${STYLE_PREFIX} A single chibi character seen directly from BEHIND (back view, face not visible), full body, standing, neutral pose, arms at sides.`;
}

export type ImageRequest = { prompt: string; references: Buffer[]; kind: "landmark" | "food" | "player"; name: string };
export interface ImageGenerator {
  readonly live: boolean;
  generate(request: ImageRequest): Promise<Buffer>;
}

/** Live: gpt-image edits with references (or plain generate without any), transparent 1024² PNG. */
export function openAIImageGenerator(client = new OpenAI({ timeout: 120_000, maxRetries: 1 })): ImageGenerator {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
  const common = { model, background: "transparent", output_format: "png", size: "1024x1024", quality: "medium", n: 1 } as const;
  return {
    live: true,
    async generate({ prompt, references }) {
      const result = references.length
        ? await client.images.edit({
          ...common, prompt,
          image: await Promise.all(references.slice(0, 4).map((r, i) => toFile(r, `ref-${i}.png`, { type: "image/png" }))),
        })
        : await client.images.generate({ ...common, prompt });
      const encoded = result.data?.[0]?.b64_json;
      if (!encoded) throw new Error("Image model returned no image");
      return Buffer.from(encoded, "base64");
    },
  };
}

function hue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** Mock: a deterministic placeholder silhouette per asset, so the whole pipeline runs with no API calls. */
export function mockImageGenerator(): ImageGenerator {
  return {
    live: false,
    async generate({ kind, name }) {
      const h = hue(name);
      const fill = `hsl(${h},55%,58%)`;
      const dark = `hsl(${h},45%,30%)`;
      const shapes = {
        landmark: `<polygon points="512,140 820,380 204,380" fill="${dark}" stroke="#222" stroke-width="24"/>
          <rect x="244" y="380" width="536" height="500" fill="${fill}" stroke="#222" stroke-width="24"/>
          <rect x="452" y="680" width="120" height="200" fill="${dark}" stroke="#222" stroke-width="16"/>
          <rect x="320" y="470" width="100" height="100" fill="#fff6c8" stroke="#222" stroke-width="12"/>
          <rect x="604" y="470" width="100" height="100" fill="#fff6c8" stroke="#222" stroke-width="12"/>`,
        food: `<ellipse cx="512" cy="460" rx="380" ry="150" fill="#f3d9a4" stroke="#222" stroke-width="24"/>
          <path d="M132 470 Q512 1000 892 470 Z" fill="${fill}" stroke="#222" stroke-width="24"/>`,
        player: `<circle cx="512" cy="300" r="170" fill="${dark}" stroke="#222" stroke-width="24"/>
          <rect x="352" y="460" width="320" height="330" rx="40" fill="${fill}" stroke="#222" stroke-width="24"/>
          <rect x="372" y="790" width="110" height="160" fill="#334" stroke="#222" stroke-width="20"/>
          <rect x="542" y="790" width="110" height="160" fill="#334" stroke="#222" stroke-width="20"/>`,
      };
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${shapes[kind]}</svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  };
}

/** Run async jobs with at most `n` in flight (§5.3: cap ~6 concurrent image calls). */
export async function mapLimit<T, R>(items: T[], n: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

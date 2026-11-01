import { RequestError } from "./errors";

/** Never return upstream messages, bodies, prompts, image data or credentials. */
export function safeOpenAIError(error: unknown, label = "World generation"): RequestError {
  if (error instanceof RequestError) return error;
  const info = error && typeof error === "object" ? error as { status?: unknown; code?: unknown; name?: unknown; param?: unknown; requestID?: unknown } : {};
  const diagnostic = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : undefined;
  // Only provider identifiers; never log response bodies, prompts, photos or credentials.
  console.error("OpenAI request failed", { status: typeof info.status === "number" ? info.status : undefined,
    code: diagnostic(info.code), type: diagnostic(info.name), parameter: diagnostic(info.param), requestId: diagnostic(info.requestID),
    frames: info.name === "TypeError" && error instanceof Error ? error.stack?.split("\n").filter(line => /^\s+at /.test(line)).slice(0, 4) : undefined });
  if (info.code === "credit_balance_exhausted" || info.code === "insufficient_quota" || info.code === "billing_hard_limit_reached") {
    return new RequestError("OpenAI API credits or quota are exhausted. Add credits or check your project's billing limits, then retry. Your completed assets are kept.", 503);
  }
  if (info.status === 429 || info.code === "rate_limit_exceeded") {
    return new RequestError("The image service is busy. Wait a moment, then retry the remaining assets.", 429);
  }
  if (info.status === 401 || info.code === "invalid_api_key") {
    return new RequestError("OpenAI authentication failed. Check OPENAI_API_KEY on the server, then retry.", 503);
  }
  if (info.status === 403 || info.status === 404 || info.code === "model_not_found") {
    return new RequestError("The configured OpenAI model is unavailable. Check model access, OPENAI_IMAGE_MODEL and OPENAI_TEXT_MODEL on the server, then retry.", 503);
  }
  if (info.status === 408 || info.status === 504 || info.name === "APIConnectionTimeoutError" || info.name === "AbortError" || info.name === "TimeoutError") {
    return new RequestError(`${label} timed out. Retry to continue from the assets already saved.`, 504);
  }
  return new RequestError(`${label} is unavailable right now. Please retry.`, 502);
}

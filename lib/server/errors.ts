export class RequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof RequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  // Upstream responses can contain credentials, request bodies, or photos.
  console.error("Unhandled request error", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
}

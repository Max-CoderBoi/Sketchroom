import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status);
  }
  if (error instanceof ZodError) {
    return json({ error: "Validation failed.", details: error.flatten() }, 400);
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    return json({ error: "A record with that value already exists." }, 409);
  }
  if (typeof error === "object" && error !== null && "name" in error && error.name === "CastError") {
    return json({ error: "Invalid resource identifier." }, 400);
  }
  console.error("Unhandled API error:", error);
  return json({ error: "Internal server error." }, 500);
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const ok = <T>(data: T, status = 200) => NextResponse.json({ data }, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Wrap a controller call so every route returns the { data } | { error } envelope. */
export async function handle<T>(fn: () => Promise<T>, okStatus = 200) {
  try {
    return ok(await fn(), okStatus);
  } catch (e) {
    if (e instanceof ZodError) return fail(e.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "), 422);
    if (e instanceof HttpError) return fail(e.message, e.status);
    console.error(e);
    return fail(e instanceof Error ? e.message : "Internal error", 500);
  }
}

export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

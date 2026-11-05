import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import * as controller from "@/controllers/assistant.controller";

// No route segment config here (cacheComponents is enabled).
export const POST = (req: NextRequest) =>
  handle(async () => controller.chat(await req.json().catch(() => ({})), controller.clientKey(req.headers)));

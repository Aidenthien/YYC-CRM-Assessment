import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import * as controller from "@/controllers/assistant.controller";

export const POST = (req: NextRequest) =>
  handle(async () => controller.commit(await req.json().catch(() => ({})), controller.clientKey(req.headers)), 201);

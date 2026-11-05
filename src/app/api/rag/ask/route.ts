import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import * as controller from "@/controllers/rag.controller";


export const POST = (req: NextRequest) =>
  handle(async () => controller.ask(await req.json().catch(() => ({}))));

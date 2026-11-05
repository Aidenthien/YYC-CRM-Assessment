import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import * as controller from "@/controllers/rag.controller";

export const GET = (req: NextRequest) =>
  handle(() => controller.listSessions(Object.fromEntries(req.nextUrl.searchParams)));

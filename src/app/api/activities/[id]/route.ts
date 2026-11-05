import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import * as controller from "@/controllers/activity.controller";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = (_req: NextRequest, { params }: Ctx) =>
  handle(async () => controller.remove((await params).id));

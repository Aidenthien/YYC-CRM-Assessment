import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import * as controller from "@/controllers/rag.controller";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: NextRequest, { params }: Ctx) =>
  handle(async () => controller.getSession((await params).id));

export const PATCH = (req: NextRequest, { params }: Ctx) =>
  handle(async () => controller.renameSession((await params).id, await req.json().catch(() => ({}))));

export const DELETE = (_req: NextRequest, { params }: Ctx) =>
  handle(async () => controller.removeSession((await params).id));

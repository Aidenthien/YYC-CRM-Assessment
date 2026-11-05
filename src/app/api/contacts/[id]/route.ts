import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import * as controller from "@/controllers/contact.controller";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: NextRequest, { params }: Ctx) =>
  handle(async () => controller.get((await params).id));

export const PUT = (req: NextRequest, { params }: Ctx) =>
  handle(async () => controller.update((await params).id, await req.json().catch(() => ({}))));

export const DELETE = (_req: NextRequest, { params }: Ctx) =>
  handle(async () => controller.remove((await params).id));

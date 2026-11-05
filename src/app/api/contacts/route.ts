import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import * as controller from "@/controllers/contact.controller";


export const GET = (req: NextRequest) =>
  handle(() => controller.list(Object.fromEntries(req.nextUrl.searchParams)));

export const POST = (req: NextRequest) =>
  handle(async () => controller.create(await req.json().catch(() => ({}))), 201);

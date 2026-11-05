import { handle } from "@/lib/http";
import * as controller from "@/controllers/rag.controller";

export const GET = () => handle(() => controller.documents());

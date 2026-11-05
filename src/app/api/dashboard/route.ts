import { handle } from "@/lib/http";
import * as controller from "@/controllers/dashboard.controller";


export const GET = () => handle(() => controller.stats());

import type { DashboardStats } from "@/types";
import * as dashboard from "@/models/dashboard.model";

export async function stats(): Promise<DashboardStats> {
  const [total_contacts, opps, recent_activities] = await Promise.all([
    dashboard.countContacts(),
    dashboard.opportunityValues(),
    dashboard.recentActivities(10),
  ]);
  const open = opps.filter((o) => o.stage !== "Won" && o.stage !== "Lost");
  return {
    total_contacts,
    open_opportunities: open.length,
    open_opportunities_value_rm: open.reduce((s, o) => s + o.value_rm, 0),
    won_value_rm: opps.filter((o) => o.stage === "Won").reduce((s, o) => s + o.value_rm, 0),
    recent_activities,
  };
}

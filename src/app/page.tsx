"use client";

import Link from "next/link";
import type { DashboardStats } from "@/types";
import { useApi } from "@/components/useApi";
import { formatRM, relativeTime } from "@/components/format";
import { ActivityIcon, EmptyState, ErrorBanner, LoadingBlock, PageHeader } from "@/components/ui";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi<DashboardStats>("/api/dashboard");

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Welcome back, Sales Rep." />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock />}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total contacts" value={data.total_contacts.toLocaleString("en-US")} />
            <StatCard label="Open opportunities" value={data.open_opportunities.toLocaleString("en-US")} />
            <StatCard label="Open pipeline value" value={formatRM(data.open_opportunities_value_rm)} />
            <StatCard label="Won value" value={formatRM(data.won_value_rm)} />
          </div>
          <section className="card">
            <h2 className="border-b border-zinc-200 px-5 py-3 text-base font-semibold dark:border-zinc-800">Recent activity</h2>
            {data.recent_activities.length === 0 ? (
              <EmptyState title="No activity yet" hint="Log a call, email or meeting from a contact page." action={<Link href="/contacts" className="btn-primary">Go to contacts</Link>} />
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.recent_activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <ActivityIcon type={a.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{a.description}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {a.contact && (
                          <Link href={`/contacts/${a.contact.id}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">{a.contact.name}</Link>
                        )}
                        {a.contact && a.opportunity && " · "}
                        {a.opportunity && <span>{a.opportunity.title}</span>}
                      </p>
                    </div>
                    <time dateTime={a.activity_date} className="shrink-0 text-xs text-zinc-500">{relativeTime(a.activity_date)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

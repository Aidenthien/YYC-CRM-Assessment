"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CONTACT_STATUSES } from "@/types";
import type { Contact } from "@/types";
import { useApi } from "@/components/useApi";
import { ContactFormModal } from "@/components/forms";
import { ConfirmModal, EmptyState, ErrorBanner, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui";

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams();
  if (debounced) params.set("search", debounced);
  if (status) params.set("status", status);
  const qs = params.toString();
  const { data, error, loading, reload } = useApi<Contact[]>(`/api/contacts${qs ? `?${qs}` : ""}`);

  async function confirmDelete() {
    if (!deleting) return;
    setDelBusy(true);
    setDelError(null);
    try {
      await api.deleteContact(deleting.id);
      setDeleting(null);
      reload();
    } catch (e) {
      setDelError((e as Error).message);
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle="Leads, prospects and customers."
        actions={<button className="btn-primary" onClick={() => setEditing("new")}>+ New contact</button>}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="search" className="sr-only">Search contacts</label>
          <input id="search" type="search" className="input" placeholder="Search by name, email or company" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="status" className="sr-only">Filter by status</label>
          <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {CONTACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      <div className="card overflow-hidden">
        {loading && !data ? (
          <LoadingBlock />
        ) : data && data.length === 0 ? (
          <EmptyState
            title={debounced || status ? "No matching contacts" : "No contacts yet"}
            hint={debounced || status ? "Try a different search or filter." : "Create your first contact to get started."}
            action={!debounced && !status ? <button className="btn-primary" onClick={() => setEditing("new")}>+ New contact</button> : undefined}
          />
        ) : (
          data && (
            <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Company</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Email</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">Phone</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data.map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${c.id}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">{c.name}</Link>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">{c.company ?? "-"}</td>
                      <td className="hidden px-4 py-3 md:table-cell">{c.email ?? "-"}</td>
                      <td className="hidden px-4 py-3 lg:table-cell">{c.phone ?? "-"}</td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button className="btn-ghost !px-2 !py-1" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>Edit</button>
                        <button className="btn-ghost !px-2 !py-1 text-red-600 dark:text-red-400" onClick={() => { setDelError(null); setDeleting(c); }} aria-label={`Delete ${c.name}`}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      {editing && (
        <ContactFormModal
          contact={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Delete contact"
          message={`Delete ${deleting.name}? Their opportunities and activities will also be removed. This cannot be undone.`}
          busy={delBusy}
          error={delError}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

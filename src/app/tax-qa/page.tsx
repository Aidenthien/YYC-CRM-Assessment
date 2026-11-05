"use client";

import { useState } from "react";
import type { Contact, TaxDocument } from "@/types";
import { useApi } from "@/components/useApi";
import TaxChat from "@/components/TaxChat";
import { EmptyState, ErrorBanner, LoadingBlock, PageHeader } from "@/components/ui";

export default function TaxQaPage() {
  const contacts = useApi<Contact[]>("/api/contacts");
  const docs = useApi<TaxDocument[]>("/api/rag/documents");
  const [contactId, setContactId] = useState("");
  const [category, setCategory] = useState("");

  const categories = Array.from(new Set((docs.data ?? []).map((d) => d.category))).sort();
  const contact = contacts.data?.find((c) => c.id === contactId);

  return (
    <>
      <PageHeader title="Tax Assistant" subtitle="Cited answers from the Malaysian tax knowledge base." />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="card flex h-[calc(100vh-14rem)] min-h-[30rem] flex-col">
          <div className="flex flex-wrap gap-3 border-b border-zinc-200 p-3 dark:border-zinc-800">
            <div className="min-w-48 flex-1">
              <label htmlFor="client" className="mb-1 block text-xs font-medium text-zinc-500">Asking about client</label>
              <select id="client" className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">No specific client</option>
                {(contacts.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="min-w-40">
              <label htmlFor="category" className="mb-1 block text-xs font-medium text-zinc-500">Category</label>
              <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {contact && (
            <div className="border-b border-zinc-200 bg-indigo-50 px-4 py-2 text-xs text-indigo-800 dark:border-zinc-800 dark:bg-indigo-950/40 dark:text-indigo-200">
              Asking about client: <strong>{contact.name}</strong>. Questions are saved to their history.
            </div>
          )}
          <TaxChat key={contactId} className="flex-1" contactId={contactId || undefined} category={category} contactLabel={contact?.name} />
        </section>

        <aside className="card self-start">
          <h2 className="border-b border-zinc-200 px-4 py-3 text-base font-semibold dark:border-zinc-800">Knowledge base</h2>
          {docs.error && <div className="p-3"><ErrorBanner message={docs.error} onRetry={docs.reload} /></div>}
          {docs.loading && !docs.data ? (
            <LoadingBlock />
          ) : docs.data && docs.data.length === 0 ? (
            <EmptyState title="No documents ingested" hint="Run the ingestion script to load tax documents." />
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(docs.data ?? []).map((d) => (
                <li key={d.id} className="px-4 py-3 text-sm">
                  <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">{d.name}</a>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {d.category}
                    {d.page_count != null && ` · ${d.page_count} pages`} · {d.chunk_count} chunks
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}

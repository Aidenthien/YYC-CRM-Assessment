"use client";

import { useState } from "react";
import { CONTACT_STATUSES, OPPORTUNITY_STAGES, type ContactStatus, type OpportunityStage } from "@/types";
import type { Proposal, ProposalView } from "@/lib/assistantApi";

export type ProposalState = "pending" | "saving" | "saved" | "cancelled" | "superseded";

interface Fields {
  name: string; email: string; phone: string; company: string; status: ContactStatus;
  title: string; value: string; stage: OpportunityStage;
}

function toFields(p: Proposal): Fields {
  const c = p.kind === "contact" ? p.data : p.kind === "both" ? p.data.contact : null;
  const o = p.kind === "opportunity" ? p.data : p.kind === "both" ? p.data.opportunity : null;
  return {
    name: c?.name ?? "", email: c?.email ?? "", phone: c?.phone ?? "", company: c?.company ?? "", status: c?.status ?? "Lead",
    title: o?.title ?? "", value: String(o?.value_rm ?? ""), stage: o?.stage ?? "New",
  };
}

function toProposal(base: Proposal, f: Fields): Proposal {
  const contact = { name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null, company: f.company.trim() || null, status: f.status };
  const opp = { title: f.title.trim(), value_rm: Number(f.value.replace(/,/g, "")) || 0, stage: f.stage };
  if (base.kind === "contact") return { kind: "contact", data: contact };
  if (base.kind === "both") return { kind: "both", data: { contact, opportunity: opp } };
  return { kind: "opportunity", data: { ...opp, contact_id: base.data.contact_id } };
}

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value || <span className="font-normal text-zinc-400">-</span>}</dd>
    </div>
  );
}

function Input({ id, label, value, onChange, type = "text", mode }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; mode?: "decimal" }) {
  return (
    <div>
      <label htmlFor={id} className="label !mb-0.5 !text-xs">{label}</label>
      <input id={id} className="input !py-1.5" type={type} inputMode={mode} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function ProposalCard({ uid, view, state, error, onConfirm, onCancel }: {
  uid: string;
  view: ProposalView;
  state: ProposalState;
  error?: string | null;
  onConfirm: (p: Proposal) => void;
  onCancel: () => void;
}) {
  const base = view.proposal;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<Fields>(() => toFields(base));
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((s) => ({ ...s, [k]: v }));
  const showContact = base.kind !== "opportunity";
  const showOpp = base.kind !== "contact";
  const title = base.kind === "contact" ? "Save this contact?" : base.kind === "opportunity" ? "Save this opportunity?" : "Save this contact and opportunity?";
  const active = state === "pending" || state === "saving";
  const cur = toProposal(base, f);
  const valueNum = Number(f.value.replace(/,/g, "")) || 0;

  return (
    <section aria-label={title} className={`mt-2 w-full rounded-xl border p-3 ${active ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/30" : "border-zinc-200 bg-zinc-50 opacity-70 dark:border-zinc-800 dark:bg-zinc-900"}`}>
      <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
      {edit && active ? (
        <div className="grid grid-cols-2 gap-2">
          {showContact && (
            <>
              <div className="col-span-2"><Input id={`${uid}-name`} label="Name" value={f.name} onChange={(v) => set("name", v)} /></div>
              <div className="col-span-2"><Input id={`${uid}-email`} label="Email" type="email" value={f.email} onChange={(v) => set("email", v)} /></div>
              <Input id={`${uid}-phone`} label="Phone" value={f.phone} onChange={(v) => set("phone", v)} />
              <Input id={`${uid}-company`} label="Company" value={f.company} onChange={(v) => set("company", v)} />
              <div className="col-span-2">
                <label htmlFor={`${uid}-status`} className="label !mb-0.5 !text-xs">Status</label>
                <select id={`${uid}-status`} className="input !py-1.5" value={f.status} onChange={(e) => set("status", e.target.value as ContactStatus)}>
                  {CONTACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </>
          )}
          {showOpp && (
            <>
              <div className="col-span-2"><Input id={`${uid}-title`} label="Opportunity title" value={f.title} onChange={(v) => set("title", v)} /></div>
              <Input id={`${uid}-value`} label="Value (RM)" mode="decimal" value={f.value} onChange={(v) => set("value", v)} />
              <div>
                <label htmlFor={`${uid}-stage`} className="label !mb-0.5 !text-xs">Stage</label>
                <select id={`${uid}-stage`} className="input !py-1.5" value={f.stage} onChange={(e) => set("stage", e.target.value as OpportunityStage)}>
                  {OPPORTUNITY_STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      ) : (
        <dl className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {showContact && (
            <div className="pb-1">
              <Row label="Name" value={f.name} />
              <Row label="Email" value={f.email} />
              <Row label="Phone" value={f.phone} />
              <Row label="Company" value={f.company} />
              <Row label="Status" value={f.status} />
            </div>
          )}
          {showOpp && (
            <div className={showContact ? "pt-1" : ""}>
              <Row label="Title" value={f.title} />
              <Row label="Value" value={rm(valueNum)} />
              <Row label="Stage" value={f.stage} />
              {base.kind === "opportunity" && <Row label="Contact" value={view.display?.contact_name ? `${view.display.contact_name}${view.display.contact_company ? ` (${view.display.contact_company})` : ""}` : undefined} />}
            </div>
          )}
        </dl>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {active ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary !px-3 !py-1.5" disabled={state === "saving"} onClick={() => onConfirm(cur)}>{state === "saving" ? "Saving..." : "Confirm"}</button>
          <button className="btn-secondary !px-3 !py-1.5" disabled={state === "saving"} onClick={() => setEdit((e) => !e)} aria-pressed={edit}>{edit ? "Done" : "Edit"}</button>
          <button className="btn-ghost !px-3 !py-1.5" disabled={state === "saving"} onClick={onCancel}>Cancel</button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">{state === "saved" ? "Saved" : state === "cancelled" ? "Cancelled" : "Replaced by a newer suggestion"}</p>
      )}
    </section>
  );
}

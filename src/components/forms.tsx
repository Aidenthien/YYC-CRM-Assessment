"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { CONTACT_STATUSES, OPPORTUNITY_STAGES, ACTIVITY_TYPES } from "@/types";
import type { ActivityType, Contact, ContactStatus, Opportunity, OpportunityStage } from "@/types";
import { ErrorBanner, Field, Modal } from "./ui";
import { useApi } from "./useApi";

function FormActions({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving..." : label}</button>
    </div>
  );
}

export function ContactFormModal({ contact, onClose, onSaved }: { contact?: Contact; onClose: () => void; onSaved: (c: Contact) => void }) {
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [status, setStatus] = useState<ContactStatus>(contact?.status ?? "Lead");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (phone.trim() && !/^[+\d][\d\s()-]{5,}$/.test(phone.trim())) errs.phone = "Enter a valid phone number.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        status,
      };
      const saved = contact ? await api.updateContact(contact.id, body) : await api.createContact(body);
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={contact ? "Edit contact" : "New contact"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {error && <ErrorBanner message={error} />}
        <Field label="Name *" htmlFor="c-name" error={errors.name}>
          <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" htmlFor="c-email" error={errors.email}>
            <input id="c-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="c-phone" error={errors.phone}>
            <input id="c-phone" type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Company" htmlFor="c-company">
          <input id="c-company" className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Status" htmlFor="c-status">
          <select id="c-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as ContactStatus)}>
            {CONTACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <FormActions busy={busy} onClose={onClose} label={contact ? "Save changes" : "Create contact"} />
      </form>
    </Modal>
  );
}

export function OpportunityFormModal({ opportunity, fixedContactId, onClose, onSaved }: {
  opportunity?: Opportunity; fixedContactId?: string; onClose: () => void; onSaved: (o: Opportunity) => void;
}) {
  const contacts = useApi<Contact[]>(fixedContactId ? null : "/api/contacts");
  const [title, setTitle] = useState(opportunity?.title ?? "");
  const [value, setValue] = useState(opportunity ? String(opportunity.value_rm) : "");
  const [stage, setStage] = useState<OpportunityStage>(opportunity?.stage ?? "New");
  const [contactId, setContactId] = useState(opportunity?.contact_id ?? fixedContactId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const num = Number(value);
    if (!title.trim()) errs.title = "Title is required.";
    if (value.trim() === "" || isNaN(num) || num < 0) errs.value = "Enter a value of 0 or more.";
    if (!contactId) errs.contact = "Select a contact.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const body = { title: title.trim(), value_rm: num, stage, contact_id: contactId };
      const saved = opportunity ? await api.updateOpportunity(opportunity.id, body) : await api.createOpportunity(body);
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={opportunity ? "Edit opportunity" : "New opportunity"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {error && <ErrorBanner message={error} />}
        {contacts.error && <ErrorBanner message={`Could not load contacts: ${contacts.error}`} />}
        <Field label="Title *" htmlFor="o-title" error={errors.title}>
          <input id="o-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Value (RM) *" htmlFor="o-value" error={errors.value}>
            <input id="o-value" type="number" min="0" step="0.01" inputMode="decimal" className="input" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Stage" htmlFor="o-stage">
            <select id="o-stage" className="input" value={stage} onChange={(e) => setStage(e.target.value as OpportunityStage)}>
              {OPPORTUNITY_STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        {!fixedContactId && (
          <Field label="Contact *" htmlFor="o-contact" error={errors.contact}>
            <select id="o-contact" className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">{contacts.loading ? "Loading..." : "Select a contact"}</option>
              {(contacts.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>
              ))}
            </select>
          </Field>
        )}
        <FormActions busy={busy} onClose={onClose} label={opportunity ? "Save changes" : "Create opportunity"} />
      </form>
    </Modal>
  );
}

function todayStr() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function LogActivityForm({ contactId, onLogged }: { contactId: string; onLogged: () => void }) {
  const [type, setType] = useState<ActivityType>("Call");
  const [date, setDate] = useState(todayStr);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return setError("Description is required.");
    setBusy(true);
    setError(null);
    try {
      const isToday = date === todayStr();
      const when = isToday ? new Date() : new Date(`${date}T12:00:00`);
      await api.createActivity({
        type,
        activity_date: when.toISOString(),
        description: description.trim(),
        contact_id: contactId,
      });
      setDescription("");
      onLogged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="a-type">
          <select id="a-type" className="input" value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
            {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date" htmlFor="a-date">
          <input id="a-date" type="date" className="input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Description" htmlFor="a-desc">
        <textarea id="a-desc" rows={2} className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened?" />
      </Field>
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Logging..." : "Log activity"}</button>
    </form>
  );
}

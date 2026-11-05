"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import Chatbot from "./chatbot/Chatbot";

const NAV = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/contacts", label: "Contacts", icon: "M16 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0" },
  { href: "/opportunities", label: "Opportunities", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z" },
  { href: "/tax-qa", label: "Tax Assistant", icon: "M4 5h16v11H9l-5 4z" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={n.icon} />
            </svg>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-zinc-200 bg-white p-4 md:flex dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/" className="px-2 text-lg font-bold tracking-tight text-indigo-600">YYC CRM</Link>
        <Suspense fallback={null}><NavLinks /></Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex items-center gap-3 md:hidden">
            <button className="btn-ghost !px-2" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            <span className="font-bold text-indigo-600">YYC CRM</span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2 text-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white" aria-hidden="true">SR</span>
            <span className="font-medium">Sales Rep</span>
          </div>
        </header>
        {open && (
          <div className="border-b border-zinc-200 bg-white p-3 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
            <Suspense fallback={null}><NavLinks onNavigate={() => setOpen(false)} /></Suspense>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
      <Chatbot />
    </div>
  );
}

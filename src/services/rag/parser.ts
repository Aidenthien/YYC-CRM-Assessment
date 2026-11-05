import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import type { PageText, SourceDoc } from "./types";

export const PDF_DIR = path.join(process.cwd(), "data", "pdfs");

export function fileNameFor(doc: SourceDoc): string {
  return doc.url.split("/").pop()!.replace(/[^a-zA-Z0-9._-]+/g, "_").toLowerCase();
}

/** Download the PDF unless already cached in data/pdfs. Returns the local path. */
export async function downloadPdf(doc: SourceDoc): Promise<string> {
  await fs.mkdir(PDF_DIR, { recursive: true });
  const file = path.join(PDF_DIR, fileNameFor(doc));
  try {
    const st = await fs.stat(file);
    if (st.size > 10_000) return file;
  } catch { /* not cached */ }
  const res = await fetch(doc.url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${doc.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`Not a PDF: ${doc.url}`);
  await fs.writeFile(file, buf);
  return file;
}

/** Parse a PDF into per-page cleaned text (1-based page numbers). */
export async function parsePdf(file: string): Promise<PageText[]> {
  const data = await fs.readFile(file);
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return cleanPages(result.pages.map((p) => ({ num: p.num, text: p.text })));
  } finally {
    await parser.destroy();
  }
}

/** Normalise whitespace, drop "-- n of m --" markers, bare page numbers and headers/footers repeated on many pages. */
export function cleanPages(pages: PageText[]): PageText[] {
  const norm = (l: string) => l.trim().replace(/\d+/g, "#").toLowerCase();
  const freq = new Map<string, number>();
  const split = pages.map((p) =>
    p.text.replace(/\r/g, "").split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()),
  );
  for (const lines of split) {
    for (const k of new Set(lines.filter((l) => l && l.length < 90).map(norm))) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const repeatThreshold = Math.max(4, pages.length * 0.4);
  return pages.map((p, i) => {
    const lines = split[i].filter((l) => {
      if (/\.{5,}/.test(l)) return false; // table-of-contents leader lines
      if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(l)) return false;
      if (/^(page\s+)?\d+(\s*(of|\/)\s*\d+)?$/i.test(l)) return false;
      if (l && l.length < 90 && (freq.get(norm(l)) ?? 0) >= repeatThreshold) return false;
      return true;
    });
    return { num: p.num, text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
  });
}

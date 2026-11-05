import type { Chunk, PageText } from "./types";

export const CHUNK_CHARS = 3000; // ~750-800 tokens
export const OVERLAP_CHARS = 450; // ~15%

interface Line { text: string; page: number; section: string | null; heading: boolean }

/** Best-effort heading detection: numbered headings ("4.2 Exemption") or ALL CAPS lines. */
export function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 110) return false;
  if (/\.{4,}/.test(t)) return false; // table-of-contents leaders
  if (/^\([a-z]\)/.test(t)) return false; // list items are not headings
  if (/[.;,:]$/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && letters.length / t.length > 0.6) return true;
  // numbered: "4.", "4.2", "4.2.1", "A.", "IV." followed by a capitalised title
  return t.length < 70 && /^(\d{1,2}(\.\d{1,2}){0,3}\.?|[A-Z]\.|[IVX]{1,5}\.)\s+[A-Z][A-Za-z]/.test(t);
}

/** Split an over-long line on sentence boundaries so no unit exceeds the chunk size. */
function splitLong(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];
  const out: string[] = [];
  let cur = "";
  for (const s of text.split(/(?<=[.!?;])\s+/)) {
    if (cur && cur.length + s.length + 1 > CHUNK_CHARS) { out.push(cur); cur = s; }
    else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out.flatMap((s) => (s.length > CHUNK_CHARS ? s.match(new RegExp(`.{1,${CHUNK_CHARS}}`, "gs"))! : [s]));
}

/**
 * Line/paragraph-aware chunking: lines accumulate up to ~CHUNK_CHARS; a chunk prefers to end right before a
 * heading once it is >= 60% full; the next chunk starts with ~15% overlapping trailing lines.
 * Each chunk records page_start/page_end and the heading in effect where it starts.
 */
export function chunkPages(pages: PageText[]): Chunk[] {
  const lines: Line[] = [];
  let section: string | null = null;
  for (const p of pages) {
    for (const raw of p.text.split("\n")) {
      const t = raw.trim();
      if (!t) continue;
      const heading = isHeading(t);
      if (heading) section = t;
      for (const piece of splitLong(t)) lines.push({ text: piece, page: p.num, section, heading });
    }
  }

  const chunks: Chunk[] = [];
  let i = 0;
  while (i < lines.length) {
    const start = i;
    let size = 0;
    const buf: Line[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const add = l.text.length + 1;
      if (buf.length && size + add > CHUNK_CHARS) break;
      if (buf.length && l.heading && size >= CHUNK_CHARS * 0.6) break;
      buf.push(l); size += add; i++;
    }
    chunks.push({
      chunk_index: chunks.length,
      page_start: buf[0].page,
      page_end: buf[buf.length - 1].page,
      section: buf[0].section,
      content: buf.map((l) => l.text).join("\n"),
    });
    if (i >= lines.length) break;
    // overlap: step back over trailing lines up to OVERLAP_CHARS (always make forward progress)
    let acc = 0;
    while (i - 1 > start && acc + lines[i - 1].text.length < OVERLAP_CHARS) { i--; acc += lines[i].text.length + 1; }
  }
  // merge tiny trailing chunks into the previous one
  const merged: Chunk[] = [];
  for (const c of chunks) {
    const prev = merged[merged.length - 1];
    if (prev && c.content.length < 200) {
      prev.content += "\n" + c.content;
      prev.page_end = Math.max(prev.page_end, c.page_end);
    } else merged.push({ ...c });
  }
  return merged.map((c, idx) => ({ ...c, chunk_index: idx }));
}

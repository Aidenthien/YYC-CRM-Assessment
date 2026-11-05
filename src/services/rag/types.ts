export interface PageText { num: number; text: string }
export interface Chunk {
  chunk_index: number;
  page_start: number;
  page_end: number;
  section: string | null;
  content: string;
}
export interface RetrievedChunk {
  id: string;
  document_id: string;
  document_name: string;
  category: string;
  source_url: string;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  content: string;
  similarity: number;
  rrf_score: number;
  keyword_hit: boolean;
}
export interface SourceDoc { name: string; category: string; url: string }

// Central place for configuration. Throws early with a clear message when a required var is missing.
function required(name: string): string {
  const v = process.env[name];
  if (!v || v === "DUMMY_NOW") throw new Error(`Missing env var ${name}. Copy .env.sample to .env and fill it in.`);
  return v;
}

export const env = {
  get supabaseUrl() { return required("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"); },
  get geminiApiKey() { return required("GEMINI_API_KEY"); },
  get chatModel() { return process.env.GEMINI_CHAT_MODEL || "gemini-3.6-flash"; },
  get routerModel() { return process.env.GEMINI_ROUTER_MODEL || "gemini-3.1-flash-lite"; },
  get embeddingModel() { return process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001"; },
  get embeddingDims() { return Number(process.env.EMBEDDING_DIMENSIONS || 768); },
  get topK() { return Number(process.env.RAG_TOP_K || 6); },
  get minSimilarity() { return Number(process.env.RAG_MIN_SIMILARITY || 0.45); },
};

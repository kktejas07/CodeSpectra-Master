-- Knowledge vector store on Postgres + pgvector (lib/rag/vector-store/pgvector.ts).
--
-- Optional: the app runs the same statements itself on first use
-- (PgVectorStore.ensureSchema, idempotent, under an advisory lock). Run this file
-- by hand when the app's database user may not CREATE EXTENSION / CREATE TABLE:
--
--   psql "$PGVECTOR_URL" -v ON_ERROR_STOP=1 -f lib/rag/vector-store/migrations/001_rag_vectors.sql
--
-- Requires pgvector >= 0.8.0 (iterative HNSW scans). This file creates the table
-- for the default model, text-embedding-3-small (1536 dims). A corpus embedded
-- with another model gets its own table rag_vectors_<model slug> with
-- vector(<dims>) — e.g. text-embedding-004 → rag_vectors_text_embedding_004,
-- vector(768) — created by ensureSchema. tests/rag-pgvector.test.ts checks this
-- file matches schemaStatements().

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_vector_tables (
  model text PRIMARY KEY,
  table_name text NOT NULL UNIQUE,
  dims integer NOT NULL CHECK (dims > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "rag_vectors_text_embedding_3_small" (
  id text PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  tenant_key text NOT NULL,
  tenant_id text,
  visibility text NOT NULL,
  chunk_index integer NOT NULL,
  text_hash text NOT NULL,
  embedding_model text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "rag_vectors_text_embedding_3_small_hnsw" ON "rag_vectors_text_embedding_3_small" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "rag_vectors_text_embedding_3_small_acl" ON "rag_vectors_text_embedding_3_small" (tenant_key, visibility, source_type);

CREATE INDEX IF NOT EXISTS "rag_vectors_text_embedding_3_small_source" ON "rag_vectors_text_embedding_3_small" (source_type, source_id, chunk_index);

INSERT INTO rag_vector_tables (model, table_name, dims)
VALUES ('text-embedding-3-small', 'rag_vectors_text_embedding_3_small', 1536)
ON CONFLICT (model) DO NOTHING;

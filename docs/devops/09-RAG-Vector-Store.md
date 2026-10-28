# Knowledge search vector store (Mongo or Postgres + pgvector)

**Audience:** engineers and operators running the knowledge layer (`frontend/lib/rag`).

Knowledge search (admin knowledge page, copilot `searchKnowledge`) is hybrid. One leg is keyword search (Mongo `$text` on `rag_chunks`). The other is vector search. Reciprocal rank fusion (`lib/rag/fusion.ts`) merges the two. This page covers where the **vector leg** runs and how to move it to Postgres.

## 1. How it works today (default: `mongo`)

- Each `rag_chunks` document holds the chunk text, its ACL fields (`tenant_key`, `visibility`, `source_type`), and its `embedding` (1536 floats for `text-embedding-3-small`, 768 for Gemini `text-embedding-004`) along with `embedding_model`.
- The vector leg picks one of two paths (`lib/rag/search.ts`):
  1. **Atlas `$vectorSearch`.** Used when the `rag_chunks_vector` Atlas Search index exists and is queryable. This needs an Atlas M10+ or Flex cluster. It only applies to the OpenAI model, and the ACL filter goes in the `$vectorSearch` filter.
  2. **Otherwise, an in-process brute-force cosine scan.** Vectors in the caller's ACL scope are read from Mongo in id-ordered batches of 2,000, and a running top-40 is kept. The scan stops after `RAG_INPROC_MAX_SCAN` vectors (default 5,000, roughly 30 MB read per query). Past that limit, recall drops silently. The hourly health check then alerts admins.
- Every hit is re-read from `rag_chunks` **under the same ACL filter** before it is returned.

## 2. The pluggable store

`lib/rag/vector-store/` defines a `VectorStore` interface (`search`, `replaceSource`, `deleteSource`, `upsert`, `count`) with two implementations:

| Store | Where vectors live | Index | ACL |
|---|---|---|---|
| `mongo` (default, unchanged) | `rag_chunks.embedding` | Atlas vector index, or the in-process scan | Mongo filter from `lib/rag/acl.ts` |
| `pgvector` | `rag_vectors_<model>` tables in Postgres | HNSW `vector_cosine_ops` + btree `(tenant_key, visibility, source_type)` + btree `(source_type, source_id, chunk_index)` | The **same** `acl.ts` filter translated to SQL (`sql-filter.ts`). Bound parameters only, and it fails closed on any unknown shape. |

Mongo stays the system of record for text, ACL fields and embeddings. Postgres only holds vectors plus ids, ACL fields, a sha256 of the chunk text and small chunk metadata (section path, prompt-injection flags). Chunk text is never stored there.

**ACL is filtered inside SQL, before `LIMIT`.** The store runs `SET LOCAL hnsw.iterative_scan = strict_order` and `hnsw.ef_search = max(PGVECTOR_EF_SEARCH, k)`. With those settings the HNSW scan keeps walking until *k* rows pass the tenant/visibility/type predicate. A small tenant next to a huge one still gets its full top-k. The app never over-fetches and trims results afterwards. **This needs pgvector ≥ 0.8.0**, and `ensureSchema` refuses older versions.

### Writes

When `PGVECTOR_URL` is set, every index write is mirrored to Postgres (`mirrorReplaceSource` / `mirrorDeleteSource` in `lib/rag/ingest.ts`). This covers re-index, removed sources, stale chunks and account purges, and it runs whichever store currently serves reads. A failed mirror never fails indexing. The source goes into the Mongo collection `rag_vector_outbox` instead, and the scheduler tick re-syncs it from Mongo every minute. A stale Postgres row can cost recall briefly but can never leak, because hits are re-read from Mongo under the ACL.

### Reads

Reads use pgvector **only when all of these hold**:

- `RAG_VECTOR_STORE=pgvector` is set.
- pgvector is configured.
- The backfill for the corpus embedding model has completed **against this same database** (host:port/db fingerprint).

Otherwise reads use Mongo. If a pgvector query fails, that query falls back to the Mongo vector path.

## 3. Provisioning Postgres with pgvector

Any Postgres 13+ with **pgvector 0.8.0 or newer** works:

- **AWS RDS / Aurora PostgreSQL**: pgvector 0.8.0 ships with current minor versions (PG 13.17+, 14.14+, 15.9+, 16.5+, 17.1+). Run `CREATE EXTENSION vector;` as the master user.
- **Supabase / Neon / Google Cloud SQL / Azure Flexible Server**: enable the `vector` extension in the console (on Azure, allow-list `VECTOR` in `azure.extensions` first).
- **Self-hosted**: use the `pgvector/pgvector:0.8.1-pg17` image, or install `postgresql-17-pgvector`, and serve TLS (`ssl = on` with a real certificate).

Create a least-privilege role and database:

```sql
CREATE ROLE codespectra_rag LOGIN PASSWORD '…';
CREATE DATABASE codespectra_rag OWNER codespectra_rag;
\c codespectra_rag
CREATE EXTENSION IF NOT EXISTS vector;   -- as a superuser / rds_superuser
```

Next, create the schema. Either let the app do it, or run the migration yourself:

- The app's role owns the database, so `ensureSchema` creates the tables and indexes on first use. It is idempotent and runs under an advisory lock.
- If you'd rather not give the app DDL rights, run the migration yourself:

  ```bash
  psql "$PGVECTOR_URL" -v ON_ERROR_STOP=1 -f frontend/lib/rag/vector-store/migrations/001_rag_vectors.sql
  ```

  The file creates the table for `text-embedding-3-small`. A Gemini-embedded corpus needs `rag_vectors_text_embedding_004` with `vector(768)`. The DDL is identical apart from the name and size, and `ensureSchema` will create it if it has the rights.

### Configuration

| Setting | Where | Notes |
|---|---|---|
| `PGVECTOR_URL` | env, or Admin → Settings secret `pgvector_url` (encrypted at rest) | `postgres://user:pass@host:5432/db`. Setting it **starts mirroring** but does not move reads. |
| `RAG_VECTOR_STORE` | env, or Admin setting `rag_vector_store` | `mongo` (default) or `pgvector`. |
| `PGVECTOR_CA_CERT` | env | PEM CA bundle when the server cert isn't publicly trusted (e.g. the AWS RDS global bundle). |
| `PGVECTOR_POOL_MAX` | env | Connections per app process (default 5). Total = replicas × workers × this. Use PgBouncer (transaction mode) above ~100. |
| `PGVECTOR_EF_SEARCH` | env | HNSW candidate list (default 100). Higher means better recall and slower queries. |

Admin-saved values override env. **TLS is mandatory with certificate verification** for every host other than `localhost`, a loopback address or a Unix socket. With `sslmode=disable/allow/prefer/no-verify` on a remote host, the config is rejected and reads and writes stay on Mongo. The SSL query parameters are stripped from the URL, and TLS is configured explicitly (`rejectUnauthorized: true`, SNI).

## 4. Switching (and switching back)

All of the steps below use the superadmin endpoint `GET|POST /api/admin/knowledge/vector-store`.

1. **Set `PGVECTOR_URL`.** From then on, new writes are mirrored.
2. **Dry run.** Send `POST {"action":"backfill","dry_run":true}`. It writes nothing and reports:
   - Mongo vs Postgres vector counts.
   - The pgvector version and whether it is supported.
   - Whether the table exists.
   - An estimated size.
3. **Backfill.** Send `POST {"action":"backfill"}`. Each call works for about 45 s. Call it again until `result.done` is `true`; the scheduler tick also continues an unfinished run on its own. The backfill is **resumable**: a cursor is saved after every 500 chunks, and rows are upserted by chunk id, so re-running is harmless. It has three phases:
   - **copy**: copies every chunk vector of the corpus model.
   - **prune**: deletes Postgres rows whose chunk no longer exists in Mongo.
   - **outbox**: drains failed mirror writes.
4. **Set `RAG_VECTOR_STORE=pgvector`.** You can set it before or after the backfill; reads only flip once the backfill is complete. Then confirm:
   - `GET` shows `reads: "pgvector"`.
   - The knowledge page shows "Postgres pgvector".
   - Run the live evaluation (`POST /api/admin/knowledge/eval`). It should report 0 ACL leaks and a success@5 similar to the previous run.
5. **Roll back** by setting `RAG_VECTOR_STORE=mongo`. Reads move back within 30 s (the config cache). Mongo still holds every embedding, so nothing else is needed. `POST {"action":"reset"}` forgets the backfill state. `POST {"action":"backfill","restart":true}` copies everything again; reads stay on Mongo until it completes.

**When the corpus embedding model changes** (for example from OpenAI to Gemini), the new model has no completed backfill yet, so reads automatically use Mongo until you run the backfill for that model.

## 5. Performance expectations

These are planning figures, not benchmarks from this deployment. Measure with the live evaluation (the latency p50/p95 it records).

| Corpus (chunks in caller scope) | Mongo in-process scan | Atlas `$vectorSearch` | pgvector HNSW |
|---|---|---|---|
| ≤ 5k | tens to a few hundred ms (reads up to ~30 MB per query) | ~10–50 ms | ~2–10 ms query + 4 round trips |
| 5k–200k | **capped at 5k** (`RAG_INPROC_MAX_SCAN`): recall loss, or more memory and Mongo I/O if raised | ~10–50 ms | ~5–20 ms, recall ~95–99% at ef_search 100 |
| 1M+ | not viable | fine (M30+) | fine when the HNSW index fits in RAM; otherwise latency climbs sharply |

Keyword search, fusion and the final Mongo re-read are unchanged, so end-to-end latency is the slower of the two legs plus the re-read.

## 6. Sizing

For `text-embedding-3-small` (1536 × float4):

- **Heap**: ≈ 6.2 KB per row, about 6.5 KB with ACL columns and metadata.
- **HNSW index** (m = 16): ≈ 6–8 KB per row.
- **Rule of thumb**: about 13 KB per chunk in total. 100k chunks ≈ 1.3 GB, and 1M chunks ≈ 13 GB. A Gemini corpus (768 dims) needs roughly half. The dry run's `estimated_mb` uses this formula.
- **RAM**: keep the HNSW index in memory. Instance RAM (or `shared_buffers` plus OS cache) should be at least 1.5 × the index size. The `rag_vectors_*_hnsw` index is the hot path.
- **Building the index**:
  - The index is created on an empty table and then maintained incrementally during the backfill. The bulk insert is the slow part, roughly 1–3k rows/s on a 2-vCPU instance.
  - For large corpora, raise `maintenance_work_mem` (≥ 1 GB) and `max_parallel_maintenance_workers` for the session or instance while backfilling.
  - If you ever need to rebuild the index, use `REINDEX INDEX CONCURRENTLY`.
- **Starting points**: 2 vCPU / 4–8 GB RAM up to about 300k chunks, and 4 vCPU / 16 GB up to about 1M.
- **Storage**: SSD, with about 2 × the data size free for vacuum and reindex.
- **Selective filters on very large tables**: if a tiny tenant sits inside a multi-million-row table, an iterative scan stops at `hnsw.max_scan_tuples` (default 20,000). The planner usually switches to the btree `(tenant_key, …)` index and an exact sort for such tenants. If not, raise `hnsw.max_scan_tuples` on the role: `ALTER ROLE codespectra_rag SET hnsw.max_scan_tuples = 100000`.

## 7. Backups and restore

The Postgres data can always be **re-derived** from Mongo (`rag_chunks` keeps the embeddings), so its backups protect recovery time, not data.

- **Managed**: keep automated snapshots and point-in-time recovery on (daily, 7-day retention is plenty).
- **Self-hosted**: run a nightly `pg_dump -Fc -t 'rag_vector*' "$PGVECTOR_URL" > rag_vectors.dump`, or use pgBackRest / WAL-G for physical backups. Store the dumps encrypted. They contain tenant-scoped embeddings, which can leak information about the source text, so treat them like Mongo backups.
- **Restore**:
  1. Set `RAG_VECTOR_STORE=mongo`.
  2. Restore the dump or snapshot.
  3. Run `POST {"action":"backfill","restart":true}` until it reports `done`. This upserts every current vector and prunes deleted ones, which fixes everything written after the snapshot.
  4. Set `RAG_VECTOR_STORE=pgvector` again.
- **Lost the database entirely**: point `PGVECTOR_URL` at a fresh one. The fingerprint changes, so reads fall back to Mongo automatically until a new backfill completes.

## 8. Monitoring

- `GET /api/admin/knowledge/vector-store` reports:
  - The store you asked for and the store actually serving reads.
  - Backfill phase and counts.
  - Outbox size, which should be 0 or close to it.
- Logs to watch:
  - `[rag/pgvector] mirror … failed, queued for re-sync` (writes are failing)
  - `[rag] pgvector search failed, using the Mongo vector path` (reads are falling back)
- The weekly live evaluation (Mondays 03:00 UTC) alerts on ACL leaks or a quality drop for whichever store is serving reads.

## 9. Tests

- `tests/rag-pgvector.test.ts` covers:
  - SQL translation, including a check that the Mongo and SQL predicates select the same rows for every caller shape.
  - TLS rules and the schema/migration file.
  - The store against `lib/rag/eval/memory-pg.ts`, which evaluates the emitted WHERE text.
  - The no-over-fetch property.
  - Mirror and outbox, resumable backfill with prune, the read switch, and fallback.
- `tests/rag-eval-pgvector.test.ts` runs the offline golden set on both stores. Per-question hits must be identical, with 0 ACL leaks on each.
- `tests/rag-pgvector.integration.test.ts` runs against a real Postgres. Set `PGVECTOR_TEST_URL` (for example `pgvector/pgvector:0.8.1-pg17` as a CI service) to enable it; otherwise it is skipped.

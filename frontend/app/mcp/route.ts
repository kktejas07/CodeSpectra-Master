/**
 * Convenience alias: `/mcp` -> `/api/mcp`.
 *
 * Some MCP clients prefer a root-level endpoint URL. Re-exports the same
 * handler so both paths are valid.
 */
export { GET, POST } from '@/app/api/mcp/route'

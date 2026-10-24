/**
 * LangGraph state-graph helpers — reusable across pipelines.
 *
 * Thin wrapper over @langchain/langgraph that adds:
 * - typed state annotations with sensible defaults
 * - error-resilient node execution (catch + record, never crash the graph)
 * - a simple graph builder that returns a compiled, invocable graph
 *
 * ponytail: no custom channels or checkpointers — just StateGraph + nodes.
 * Add MemorySaver when we need conversation persistence or human-in-the-loop.
 */
import 'server-only'

import { Annotation, StateGraph, START, END } from '@langchain/langgraph'

export { Annotation, START, END }
export type { StateGraph }

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

export interface NodeDef<S> {
  name: string
  fn: (state: S) => Promise<Partial<S>>
}

export interface EdgeDef {
  from: string
  /** Static target or conditional router. */
  to: string | ((state: any) => string)
}

/**
 * Build and compile a LangGraph StateGraph from node/edge definitions.
 *
 * Each node function receives the current state and returns a partial update.
 * Errors in a node are caught, logged, and recorded in `state.errors` (if the
 * annotation defines one) — the graph continues to the next node.
 *
 * @example
 * ```ts
 * const graph = buildGraph(MyAnnotation, [
 *   { name: 'screen', fn: screenNode },
 *   { name: 'audit', fn: auditNode },
 *   { name: 'rank', fn: rankNode },
 * ], [
 *   { from: START, to: 'screen' },
 *   { from: 'screen', to: 'audit' },
 *   { from: 'audit', to: 'rank' },
 *   { from: 'rank', to: END },
 * ])
 * const result = await graph.invoke(initialState)
 * ```
 */
export function buildGraph<S extends Record<string, any>>(
  annotation: ReturnType<typeof Annotation.Root<any>>,
  nodes: NodeDef<S>[],
  edges: EdgeDef[],
) {
  const graph = new StateGraph(annotation)

  for (const node of nodes) {
    graph.addNode(node.name, async (state: S) => {
      try {
        return await node.fn(state)
      } catch (e) {
        const msg = `[graph] node "${node.name}" failed: ${e instanceof Error ? e.message : e}`
        console.warn(msg)
        // If state has an errors array, record the failure
        if (Array.isArray((state as any).errors)) {
          return { errors: [...(state as any).errors, msg] } as unknown as Partial<S>
        }
        return {} as Partial<S>
      }
    })
  }

  for (const edge of edges) {
    if (typeof edge.to === 'function') {
      graph.addConditionalEdges(edge.from as any, edge.to as any)
    } else {
      graph.addEdge(edge.from as any, edge.to as any)
    }
  }

  return graph.compile()
}

// ---------------------------------------------------------------------------
// Common state helpers
// ---------------------------------------------------------------------------

/** Reducer that appends to an array (for errors, logs, etc). */
export function appendReducer<T>(existing: T[], update: T[]): T[] {
  return [...existing, ...update]
}

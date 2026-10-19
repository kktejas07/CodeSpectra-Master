/** Built-in connector registry. Admin-added feeds are built from their state (see feeds.ts). */
import type { Connector } from './base'
import { codechef } from './codechef'
import { codeforces } from './codeforces'
import { ctftime } from './ctftime'
import { devfolio } from './devfolio'
import { devpost } from './devpost'
import { feedConnector } from './feeds'
import { hackerearth } from './hackerearth'
import { internal } from './internal'
import { kaggle } from './kaggle'
import { leetcode } from './leetcode'
import { mlh } from './mlh'
import { simulated } from './simulated'
import { unstop } from './unstop'
import type { SourceState } from '../types'

export type { Connector, ConnectorCtx } from './base'

export const BUILTIN_CONNECTORS: Connector[] = [internal, codeforces, ctftime, kaggle, devpost, mlh, devfolio, unstop, hackerearth, codechef, leetcode, simulated]

export function isFeedSourceId(id: string): boolean {
  return /^(rss|ical):[a-z0-9-]{2,40}$/.test(id)
}

export function connectorFor(state: Pick<SourceState, 'id' | 'config'>): Connector | null {
  return BUILTIN_CONNECTORS.find((c) => c.id === state.id) || (isFeedSourceId(state.id) ? feedConnector(state) : null)
}

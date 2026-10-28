/** Collection accessor that builds its indexes once per process (retried after a failure). */
import 'server-only'
import type { Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

const ready = new Map<string, Promise<unknown> | null>()

export function lazyCollection<T extends Document>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const col = (await getMongoDb()).collection<T>(name)
    if (!ready.get(name)) {
      ready.set(name, build(col).catch((e) => {
        ready.set(name, null)
        console.error(`[indexes] ${name} build failed`, (e as Error)?.message)
      }))
    }
    await ready.get(name)
    return col
  }
}

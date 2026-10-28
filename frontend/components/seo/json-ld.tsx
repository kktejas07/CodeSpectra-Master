/**
 * Server-rendered JSON-LD. Accepts one object, a list, or nulls (skipped).
 * `<` is escaped so user-written text can never close the script tag.
 */
import type { JsonLdObject } from '@/lib/seo/jsonld'

export function serializeJsonLd(data: JsonLdObject): string {
  // `<` can't close the script tag; U+2028/2029 are escaped for old JS parsers.
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029')
}

export function JsonLd({ data }: { data: JsonLdObject | null | undefined | Array<JsonLdObject | null | undefined> }) {
  const list = (Array.isArray(data) ? data : [data]).filter((d): d is JsonLdObject => !!d)
  if (!list.length) return null
  return (
    <>
      {list.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(d) }} />
      ))}
    </>
  )
}

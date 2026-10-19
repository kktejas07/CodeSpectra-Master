'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Send, Archive, RotateCcw, Trash2, Upload, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { api, Field, money, NativeSelect, StatusBadge, TableWrap, td, th, toMajor, toMinor, withAs } from './shared'

type Kind = 'digital' | 'physical' | 'service'
interface Variant { id?: string; name: string; price: number; stock?: number | null; sku?: string }
interface Product {
  id: string; kind: Kind; title: string; slug: string; description_md: string; images: string[]; category: string; tags: string[]
  currency: 'INR' | 'USD'; price: number; compare_at_price?: number | null; variants?: Variant[]; stock?: number | null; low_stock_threshold?: number | null
  digital?: { file_ids: string[]; download_limit: number; license_note?: string } | null
  service?: { duration_min: number; mode: 'virtual' | 'in_person'; provider?: string; weekly: { dow: number; start: string; end: string }[]; timezone: string; buffer_min?: number } | null
  shipping?: { weight_g?: number; ships_from: string; regions: string[]; fee: number; free_over?: number | null; dispatch_days: number } | null
  status: string; review_note?: string | null; updated_at: string
}
interface FileRow { id: string; name: string; size: number; product_id?: string | null }

const CATEGORIES = ['books', 'courses', 'ebooks', 'templates', 'merch', 'mentoring', 'mock-interviews', 'other']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const KIND_LABEL: Record<Kind, string> = { digital: 'Digital', physical: 'Physical', service: 'Service' }

export function SellerProducts({ asPlatform, editId, currencyHint }: { asPlatform: boolean; editId?: string | null; currencyHint: 'INR' | 'USD' }) {
  const addToast = useToast()
  const [items, setItems] = useState<Product[] | null>(null)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    api<{ products: Product[] }>(withAs('/api/marketplace/seller/products', asPlatform)).then((r) => {
      setItems(r.products)
      if (editId) { const p = r.products.find((x) => x.id === editId); if (p) setEditing(p) }
    }).catch((e) => addToast({ type: 'error', title: 'Could not load products', message: e.message }))
  }, [asPlatform, editId, addToast])
  useEffect(load, [load])

  async function act(p: Product, action: 'submit' | 'restore' | 'remove') {
    setBusy(p.id)
    try {
      if (action === 'remove') {
        const r = await api<{ result: string }>(withAs(`/api/marketplace/seller/products/${p.id}`, asPlatform), { method: 'DELETE' })
        addToast({ type: 'success', title: r.result === 'deleted' ? 'Draft deleted' : 'Product archived' })
      } else {
        const r = await api<{ product: Product }>(withAs(`/api/marketplace/seller/products/${p.id}`, asPlatform), { body: { action } })
        addToast({ type: 'success', title: action === 'submit' ? (r.product.status === 'published' ? 'Product is live' : 'Sent for review') : 'Restored as a draft' })
      }
      load()
    } catch (e) {
      addToast({ type: 'error', title: 'Action failed', message: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus /> Add product</Button></div>
      {items === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : items.length === 0 ? (
        <EmptyState illustration="upload" title="No products yet" description="Create a draft, add details and files, then submit it for review." actionLabel="Add product" onAction={() => setEditing('new')} />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>Product</th><th className={th}>Type</th><th className={th}>Price</th><th className={th}>Stock</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className={td}><div className="font-medium text-foreground">{p.title}</div>{p.review_note && ['rejected', 'draft'].includes(p.status) && <div className="mt-0.5 text-xs text-destructive">Reviewer: {p.review_note}</div>}</td>
                  <td className={td}>{KIND_LABEL[p.kind]}</td>
                  <td className={`${td} tabular-nums`}>{money(p.price, p.currency)}{p.variants?.length ? '+' : ''}</td>
                  <td className={`${td} tabular-nums`}>{p.kind !== 'physical' ? '—' : p.variants?.length ? p.variants.map((v) => v.stock ?? '∞').join(' / ') : p.stock ?? 'Unlimited'}</td>
                  <td className={td}><StatusBadge status={p.status} /></td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1">
                      {p.status !== 'archived' && <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.title}`} onClick={() => setEditing(p)}><Pencil /></Button>}
                      {['draft', 'rejected'].includes(p.status) && <Button size="sm" variant="secondary" disabled={busy === p.id} onClick={() => act(p, 'submit')}><Send /> Submit</Button>}
                      {p.status === 'archived'
                        ? <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => act(p, 'restore')}><RotateCcw /> Restore</Button>
                        : <Button size="icon-sm" variant="ghost" disabled={busy === p.id} aria-label={p.status === 'draft' ? `Delete ${p.title}` : `Archive ${p.title}`} onClick={() => act(p, 'remove')}>{p.status === 'draft' ? <Trash2 /> : <Archive />}</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>
      )}
      {editing && <ProductEditor asPlatform={asPlatform} product={editing === 'new' ? null : editing} currencyHint={currencyHint} onClose={(saved) => { setEditing(null); if (saved) load() }} />}
    </div>
  )
}

function ProductEditor({ asPlatform, product, currencyHint, onClose }: { asPlatform: boolean; product: Product | null; currencyHint: 'INR' | 'USD'; onClose: (saved: boolean) => void }) {
  const addToast = useToast()
  const [kind, setKind] = useState<Kind>(product?.kind ?? 'digital')
  const [f, setF] = useState(() => ({
    title: product?.title ?? '', description_md: product?.description_md ?? '', category: product?.category ?? 'ebooks',
    tags: (product?.tags ?? []).join(', '), currency: product?.currency ?? currencyHint, price: toMajor(product?.price ?? null),
    compare_at_price: toMajor(product?.compare_at_price ?? null), images: (product?.images ?? []).join('\n'),
    stock: product?.stock === null || product?.stock === undefined ? '' : String(product.stock), low_stock_threshold: product?.low_stock_threshold == null ? '' : String(product.low_stock_threshold),
    download_limit: String(product?.digital?.download_limit ?? 5), license_note: product?.digital?.license_note ?? '',
    ships_from: product?.shipping?.ships_from ?? (currencyHint === 'USD' ? 'US' : 'IN'), regions: (product?.shipping?.regions ?? [currencyHint === 'USD' ? 'US' : 'IN']).join(', '),
    ship_fee: toMajor(product?.shipping?.fee ?? 0), free_over: toMajor(product?.shipping?.free_over ?? null), dispatch_days: String(product?.shipping?.dispatch_days ?? 2), weight_g: product?.shipping?.weight_g ? String(product.shipping.weight_g) : '',
    duration_min: String(product?.service?.duration_min ?? 60), mode: product?.service?.mode ?? 'virtual', provider: product?.service?.provider ?? 'google_meet',
    timezone: product?.service?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'), buffer_min: String(product?.service?.buffer_min ?? 0),
  }))
  const [variants, setVariants] = useState<{ id?: string; name: string; price: string; stock: string; sku: string }[]>(
    (product?.variants ?? []).map((v) => ({ id: v.id, name: v.name, price: toMajor(v.price), stock: v.stock == null ? '' : String(v.stock), sku: v.sku ?? '' })),
  )
  const [weekly, setWeekly] = useState(product?.service?.weekly ?? [{ dow: 1, start: '10:00', end: '17:00' }])
  const [fileIds, setFileIds] = useState<string[]>(product?.digital?.file_ids ?? [])
  const [files, setFiles] = useState<FileRow[]>([])
  const [maxBytes, setMaxBytes] = useState(15 * 1024 * 1024)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => {
    if (kind !== 'digital') return
    api<{ files: FileRow[]; max_bytes: number }>(withAs('/api/marketplace/seller/files', asPlatform)).then((r) => { setFiles(r.files); setMaxBytes(r.max_bytes) }).catch(() => {})
  }, [kind, asPlatform])

  async function upload(file: File) {
    if (file.size > maxBytes) { setErr(`Files can be up to ${Math.round(maxBytes / 1024 / 1024)} MB.`); return }
    setUploading(true)
    setErr(null)
    try {
      const r = await api<{ file: FileRow }>(withAs(`/api/marketplace/seller/files?name=${encodeURIComponent(file.name)}`, asPlatform), { raw: file })
      setFiles((x) => [r.file, ...x])
      setFileIds((x) => [...x, r.file.id])
      addToast({ type: 'success', title: 'File uploaded', message: 'Scanned and stored securely.' })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function payload() {
    const minor = (v: string, label: string, allowEmpty = false) => {
      const n = toMinor(v)
      if (n === null && allowEmpty) return null
      if (n === null || Number.isNaN(n)) throw new Error(`${label} must be a number like 499 or 499.50.`)
      return n
    }
    const intOrNull = (v: string) => (v.trim() === '' ? null : Number(v))
    const base: Record<string, unknown> = {
      kind, title: f.title, description_md: f.description_md, category: f.category, tags: f.tags, currency: f.currency,
      price: minor(f.price || '0', 'Price'), compare_at_price: minor(f.compare_at_price, 'Compare-at price', true),
      images: f.images.split(/\n+/).map((s) => s.trim()).filter(Boolean),
    }
    if (kind === 'digital') base.digital = { file_ids: fileIds, download_limit: Number(f.download_limit), license_note: f.license_note }
    if (kind === 'physical') {
      // stock_seen = the count this form loaded, so the server applies the change as a delta and
      // never overwrites units reserved by checkouts meanwhile.
      base.variants = variants.filter((v) => v.name.trim()).map((v) => ({ id: v.id, name: v.name, price: minor(v.price || f.price || '0', `Price for ${v.name}`), stock: intOrNull(v.stock), sku: v.sku, ...(v.id ? { stock_seen: product?.variants?.find((x) => x.id === v.id)?.stock ?? null } : {}) }))
      base.stock = intOrNull(f.stock)
      if (product) base.stock_seen = product.stock ?? null
      base.low_stock_threshold = intOrNull(f.low_stock_threshold)
      base.shipping = { ships_from: f.ships_from, regions: f.regions, fee: minor(f.ship_fee || '0', 'Shipping fee'), free_over: minor(f.free_over, 'Free-shipping threshold', true), dispatch_days: Number(f.dispatch_days), weight_g: intOrNull(f.weight_g) }
    }
    if (kind === 'service') base.service = { duration_min: Number(f.duration_min), mode: f.mode, provider: f.provider, timezone: f.timezone, buffer_min: Number(f.buffer_min), weekly }
    return base
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaving(true)
    try {
      const body = payload()
      if (product) await api(withAs(`/api/marketplace/seller/products/${product.id}`, asPlatform), { method: 'PATCH', body })
      else await api(withAs('/api/marketplace/seller/products', asPlatform), { body })
      addToast({ type: 'success', title: product ? 'Saved' : 'Draft created', message: product?.status === 'published' ? undefined : 'Submit it when it’s ready for review.' })
      onClose(true)
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(false) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit product' : 'New product'}</DialogTitle>
          <DialogDescription>Prices are in {f.currency === 'INR' ? 'rupees' : 'dollars'}. {product?.status === 'published' ? 'Changing the title, description, files or schedule sends a live product back for review.' : ''}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5">
          {!product && (
            <div role="radiogroup" aria-label="Product type" className="grid grid-cols-3 gap-2">
              {(['digital', 'physical', 'service'] as Kind[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'}`}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="pt" className="sm:col-span-2"><Input id="pt" required minLength={3} maxLength={140} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Description" htmlFor="pd" hint="Markdown is supported." className="sm:col-span-2"><Textarea id="pd" rows={5} maxLength={20000} value={f.description_md} onChange={(e) => set('description_md', e.target.value)} /></Field>
            <Field label="Category" htmlFor="pc"><NativeSelect id="pc" value={f.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('-', ' ')}</option>)}</NativeSelect></Field>
            <Field label="Tags" htmlFor="ptg" hint="Comma separated, up to 10."><Input id="ptg" value={f.tags} onChange={(e) => set('tags', e.target.value)} /></Field>
            <Field label="Currency" htmlFor="pcur"><NativeSelect id="pcur" value={f.currency} onChange={(e) => set('currency', e.target.value)}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></NativeSelect></Field>
            <Field label={kind === 'physical' && variants.length ? 'Base price (variants override)' : 'Price'} htmlFor="pp"><Input id="pp" inputMode="decimal" required value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
            <Field label="Compare-at price (optional)" htmlFor="pca" hint="Shown struck through."><Input id="pca" inputMode="decimal" value={f.compare_at_price} onChange={(e) => set('compare_at_price', e.target.value)} /></Field>
            <Field label="Image links" htmlFor="pi" hint="One https:// link per line, up to 8." className="sm:col-span-2"><Textarea id="pi" rows={2} value={f.images} onChange={(e) => set('images', e.target.value)} /></Field>
          </div>

          {kind === 'digital' && (
            <fieldset className="space-y-3 rounded-2xl border border-border p-4">
              <legend className="px-1 text-sm font-semibold">Files</legend>
              <p className="text-xs text-muted-foreground">PDF, EPUB, ZIP, Office, MP3, MP4, images or text — up to {Math.round(maxBytes / 1024 / 1024)} MB each. Every file is virus-scanned and encrypted; buyers get short-lived download links.</p>
              <input ref={fileInput} type="file" className="sr-only" id="pfile" onChange={(e) => { const x = e.target.files?.[0]; if (x) void upload(x) }} />
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Upload />} Upload a file</Button>
              {files.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {files.map((x) => (
                    <li key={x.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" id={`f-${x.id}`} className="h-4 w-4 accent-[var(--primary)]" checked={fileIds.includes(x.id)} onChange={(e) => setFileIds((ids) => e.target.checked ? [...ids, x.id] : ids.filter((i) => i !== x.id))} />
                      <label htmlFor={`f-${x.id}`} className="min-w-0 flex-1 truncate">{x.name}</label>
                      <span className="text-xs tabular-nums text-muted-foreground">{(x.size / 1024 / 1024).toFixed(1)} MB</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Downloads per purchase" htmlFor="pdl"><Input id="pdl" type="number" min={1} max={50} value={f.download_limit} onChange={(e) => set('download_limit', e.target.value)} /></Field>
                <Field label="License note (optional)" htmlFor="pln"><Input id="pln" maxLength={1000} value={f.license_note} onChange={(e) => set('license_note', e.target.value)} /></Field>
              </div>
            </fieldset>
          )}

          {kind === 'physical' && (
            <>
              <fieldset className="space-y-3 rounded-2xl border border-border p-4">
                <legend className="px-1 text-sm font-semibold">Stock and variants</legend>
                {variants.length === 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Stock" htmlFor="pst" hint="Leave blank for unlimited."><Input id="pst" type="number" min={0} value={f.stock} onChange={(e) => set('stock', e.target.value)} /></Field>
                    <Field label="Low-stock alert at" htmlFor="plt" hint="Default 5."><Input id="plt" type="number" min={0} value={f.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></Field>
                  </div>
                )}
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto]">
                    <Input aria-label="Variant name" placeholder="Size / format" value={v.name} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                    <Input aria-label="Variant price" inputMode="decimal" placeholder="Price" value={v.price} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                    <Input aria-label="Variant stock" type="number" min={0} placeholder="Stock" value={v.stock} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, stock: e.target.value } : x))} />
                    <Input aria-label="SKU" placeholder="SKU" value={v.sku} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, sku: e.target.value } : x))} />
                    <Button type="button" size="icon" variant="ghost" aria-label="Remove variant" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}><X /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setVariants((vs) => [...vs, { name: '', price: f.price, stock: '', sku: '' }])}><Plus /> Add variant</Button>
              </fieldset>
              <fieldset className="grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-3">
                <legend className="px-1 text-sm font-semibold">Shipping</legend>
                <Field label="Ships from" htmlFor="psf" hint="Country code, e.g. IN"><Input id="psf" maxLength={2} value={f.ships_from} onChange={(e) => set('ships_from', e.target.value.toUpperCase())} /></Field>
                <Field label="Ships to" htmlFor="psr" hint="Codes, comma separated, or WORLD" className="sm:col-span-2"><Input id="psr" value={f.regions} onChange={(e) => set('regions', e.target.value.toUpperCase())} /></Field>
                <Field label="Shipping fee" htmlFor="psfee"><Input id="psfee" inputMode="decimal" value={f.ship_fee} onChange={(e) => set('ship_fee', e.target.value)} /></Field>
                <Field label="Free over (optional)" htmlFor="psfo"><Input id="psfo" inputMode="decimal" value={f.free_over} onChange={(e) => set('free_over', e.target.value)} /></Field>
                <Field label="Dispatch within (days)" htmlFor="psd"><Input id="psd" type="number" min={0} max={30} value={f.dispatch_days} onChange={(e) => set('dispatch_days', e.target.value)} /></Field>
                <Field label="Weight in grams (optional)" htmlFor="psw"><Input id="psw" type="number" min={1} value={f.weight_g} onChange={(e) => set('weight_g', e.target.value)} /></Field>
              </fieldset>
            </>
          )}

          {kind === 'service' && (
            <fieldset className="space-y-4 rounded-2xl border border-border p-4">
              <legend className="px-1 text-sm font-semibold">Sessions</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Length (minutes)" htmlFor="sd"><Input id="sd" type="number" min={15} max={480} value={f.duration_min} onChange={(e) => set('duration_min', e.target.value)} /></Field>
                <Field label="Gap between sessions" htmlFor="sb" hint="Minutes"><Input id="sb" type="number" min={0} max={120} value={f.buffer_min} onChange={(e) => set('buffer_min', e.target.value)} /></Field>
                <Field label="Mode" htmlFor="sm"><NativeSelect id="sm" value={f.mode} onChange={(e) => set('mode', e.target.value)}><option value="virtual">Online</option><option value="in_person">In person</option></NativeSelect></Field>
                <Field label="Meeting app" htmlFor="sp"><NativeSelect id="sp" value={f.provider} onChange={(e) => set('provider', e.target.value)}><option value="google_meet">Google Meet</option><option value="zoom">Zoom</option><option value="teams">Microsoft Teams</option><option value="livekit">CodeSpectra video</option><option value="manual">I&apos;ll send a link</option></NativeSelect></Field>
                <Field label="Time zone" htmlFor="stz" className="sm:col-span-2"><Input id="stz" value={f.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Weekly availability</p>
                {weekly.map((w, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <NativeSelect aria-label="Day" value={w.dow} onChange={(e) => setWeekly((ws) => ws.map((x, j) => j === i ? { ...x, dow: Number(e.target.value) } : x))}>{DOW.map((d, n) => <option key={d} value={n}>{d}</option>)}</NativeSelect>
                    <Input aria-label="From" type="time" value={w.start} onChange={(e) => setWeekly((ws) => ws.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
                    <Input aria-label="To" type="time" value={w.end} onChange={(e) => setWeekly((ws) => ws.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
                    <Button type="button" size="icon" variant="ghost" aria-label="Remove window" onClick={() => setWeekly((ws) => ws.filter((_, j) => j !== i))}><X /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setWeekly((ws) => [...ws, { dow: 1, start: '10:00', end: '17:00' }])}><Plus /> Add window</Button>
              </div>
            </fieldset>
          )}

          {err && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onClose(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin motion-reduce:animate-none" />}{product ? 'Save changes' : 'Save draft'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

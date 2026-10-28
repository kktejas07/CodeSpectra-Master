/**
 * Digest templates (pure, client-safe). Templates are data: admins edit the
 * heading, intro, outro and section headings per language (Admin → Daily
 * digest → Templates); anything left empty falls back to the default here.
 *
 *   templateSummary(item, lang)        1–2 lines strictly from the item's facts
 *   renderDigest(doc, lang, tpl)       view model for /digest/<date>, email, cards
 *   digestEmailHtml / digestWhatsAppText / categoryRoundup
 *
 * Source titles always stay in their original language; chips, headings and
 * template summaries follow the page / recipient language.
 */
import { z } from 'zod'
import { DIGEST_CATEGORIES, DIGEST_LOCALES, type DigestCategory, type DigestDoc, type DigestItem, type DigestLocale } from './types'

export interface DigestTemplate {
  heading: string
  intro: string
  outro: string
  sections: Record<DigestCategory, string>
}

export type DigestTemplates = Record<DigestLocale, DigestTemplate>

export const DEFAULT_TEMPLATES: DigestTemplates = {
  en: {
    heading: 'Daily digest: {date}',
    intro: 'The best hackathons, contests, tech news and Learn posts for builders today, picked and checked by the CodeSpectra digest curator.',
    outro: 'Deadlines and prizes come from each organiser’s listing. Check the source before you register.',
    sections: {
      hackathon: 'Hackathons', ctf: 'Capture the flag', datathon: 'Datathons', conference: 'Conferences and meetups', contest: 'Contests',
      codeathon: 'Codeathons and coding rounds', news: 'Tech news', learn: 'From Learn', platform: 'New on CodeSpectra',
    },
  },
  hi: {
    heading: 'डेली डाइजेस्ट: {date}',
    intro: 'आज के बेहतरीन hackathons, contests, टेक खबरें और Learn पोस्ट — CodeSpectra डाइजेस्ट क्यूरेटर ने चुने और जाँचे।',
    outro: 'डेडलाइन और इनाम हर आयोजक की लिस्टिंग से लिए गए हैं। रजिस्टर करने से पहले स्रोत ज़रूर देखें।',
    sections: {
      hackathon: 'Hackathons', ctf: 'Capture the flag', datathon: 'Datathons', conference: 'कॉन्फ्रेंस और मीटअप', contest: 'Contests',
      codeathon: 'Codeathons और कोडिंग राउंड', news: 'टेक खबरें', learn: 'Learn से', platform: 'CodeSpectra पर नया',
    },
  },
  te: {
    heading: 'డైలీ డైజెస్ట్: {date}',
    intro: 'ఈ రోజు బెస్ట్ hackathons, contests, టెక్ వార్తలు, Learn పోస్టులు — CodeSpectra డైజెస్ట్ క్యూరేటర్ ఎంచుకుని, తనిఖీ చేసినవి.',
    outro: 'డెడ్‌లైన్‌లు, బహుమతులు ప్రతి నిర్వాహకుల లిస్టింగ్ నుంచి తీసుకున్నవి. రిజిస్టర్ చేసే ముందు సోర్స్ చూడండి.',
    sections: {
      hackathon: 'Hackathons', ctf: 'Capture the flag', datathon: 'Datathons', conference: 'కాన్ఫరెన్స్‌లు, మీటప్‌లు', contest: 'Contests',
      codeathon: 'Codeathons, కోడింగ్ రౌండ్లు', news: 'టెక్ వార్తలు', learn: 'Learn నుంచి', platform: 'CodeSpectra లో కొత్తది',
    },
  },
}

const text = (max: number) => z.string().trim().max(max)
const TemplatePatch = z.object({
  heading: text(120).optional(),
  intro: text(600).optional(),
  outro: text(600).optional(),
  sections: z.object(Object.fromEntries(DIGEST_CATEGORIES.map((c) => [c, text(80).optional()])) as Record<DigestCategory, z.ZodOptional<z.ZodString>>).partial().optional(),
}).strict()
export const DigestTemplatesPatchSchema = z.object(Object.fromEntries(DIGEST_LOCALES.map((l) => [l, TemplatePatch.optional()])) as Record<DigestLocale, z.ZodOptional<typeof TemplatePatch>>).strict()
export type DigestTemplatesPatch = z.infer<typeof DigestTemplatesPatchSchema>

/** Stored overrides → full templates (empty strings = default). Pure. */
export function mergeTemplates(raw: unknown): DigestTemplates {
  const r = DigestTemplatesPatchSchema.safeParse(raw && typeof raw === 'object' ? raw : {})
  const p = r.success ? r.data : {}
  const out = {} as DigestTemplates
  for (const l of DIGEST_LOCALES) {
    const d = DEFAULT_TEMPLATES[l]
    const o = p[l] || {}
    const sections = { ...d.sections }
    for (const c of DIGEST_CATEGORIES) if (o.sections?.[c]) sections[c] = o.sections[c]!
    out[l] = { heading: o.heading || d.heading, intro: o.intro || d.intro, outro: o.outro || d.outro, sections }
  }
  return out
}

// ─── Labels (chips, template summaries) ──────────────────────────────────────

const L: Record<DigestLocale, Record<string, string>> = {
  en: {
    starts: 'Starts', deadline: 'Register by', ends: 'Ends', prize: 'Prizes', online: 'Online', in_person: 'In person', hybrid: 'Hybrid', india: 'India', global: 'Global', other: 'Worldwide',
    by: 'By', read: 'Read on CodeSpectra', source: 'Source', open: 'Open the listing', closes_in: 'Registration closes {date}.', runs: 'Runs {from} to {to}.', starts_on: 'Starts {date}.',
    prizes: 'Prizes: {prize}.', mode_line: '{mode} {kind}', level: 'Level', topic: 'Topic', items_count: '{count} picks today', updated: 'Published',
    hackathon: 'hackathon', ctf: 'CTF', datathon: 'datathon', conference: 'conference', contest: 'contest', codeathon: 'coding round', news: 'news', learn: 'Learn post', platform: 'on CodeSpectra',
    in_city: 'in {city}', learn_line: 'A {level} read on CodeSpectra Learn.', learn_line_nolevel: 'A new read on CodeSpectra Learn.', news_line: 'Reported by {source}.', platform_line: 'New on CodeSpectra: practise and track your progress.',
  },
  hi: {
    starts: 'शुरू', deadline: 'रजिस्टर करें', ends: 'खत्म', prize: 'इनाम', online: 'ऑनलाइन', in_person: 'ऑफ़लाइन', hybrid: 'हाइब्रिड', india: 'भारत', global: 'ग्लोबल', other: 'दुनिया भर',
    by: 'आयोजक', read: 'CodeSpectra पर पढ़ें', source: 'स्रोत', open: 'लिस्टिंग खोलें', closes_in: 'रजिस्ट्रेशन {date} को बंद।', runs: '{from} से {to} तक।', starts_on: '{date} से शुरू।',
    prizes: 'इनाम: {prize}।', mode_line: '{mode} {kind}', level: 'स्तर', topic: 'विषय', items_count: 'आज {count} चुनी गई चीज़ें', updated: 'प्रकाशित',
    hackathon: 'hackathon', ctf: 'CTF', datathon: 'datathon', conference: 'कॉन्फ्रेंस', contest: 'contest', codeathon: 'कोडिंग राउंड', news: 'खबर', learn: 'Learn पोस्ट', platform: 'CodeSpectra पर',
    in_city: '{city} में', learn_line: 'CodeSpectra Learn पर {level} स्तर का लेख।', learn_line_nolevel: 'CodeSpectra Learn पर नया लेख।', news_line: '{source} की रिपोर्ट।', platform_line: 'CodeSpectra पर नया: अभ्यास करें और प्रगति देखें।',
  },
  te: {
    starts: 'ప్రారంభం', deadline: 'రిజిస్టర్ చివరి తేదీ', ends: 'ముగింపు', prize: 'బహుమతులు', online: 'ఆన్‌లైన్', in_person: 'ఆఫ్‌లైన్', hybrid: 'హైబ్రిడ్', india: 'భారత్', global: 'గ్లోబల్', other: 'ప్రపంచవ్యాప్తం',
    by: 'నిర్వాహకులు', read: 'CodeSpectra లో చదవండి', source: 'సోర్స్', open: 'లిస్టింగ్ తెరవండి', closes_in: 'రిజిస్ట్రేషన్ {date} న ముగుస్తుంది.', runs: '{from} నుంచి {to} వరకు.', starts_on: '{date} న ప్రారంభం.',
    prizes: 'బహుమతులు: {prize}.', mode_line: '{mode} {kind}', level: 'స్థాయి', topic: 'అంశం', items_count: 'ఈ రోజు {count} ఎంపికలు', updated: 'ప్రచురణ',
    hackathon: 'hackathon', ctf: 'CTF', datathon: 'datathon', conference: 'కాన్ఫరెన్స్', contest: 'contest', codeathon: 'కోడింగ్ రౌండ్', news: 'వార్త', learn: 'Learn పోస్ట్', platform: 'CodeSpectra లో',
    in_city: '{city} లో', learn_line: 'CodeSpectra Learn లో {level} స్థాయి వ్యాసం.', learn_line_nolevel: 'CodeSpectra Learn లో కొత్త వ్యాసం.', news_line: '{source} రిపోర్ట్.', platform_line: 'CodeSpectra లో కొత్తది: ప్రాక్టీస్ చేసి ప్రోగ్రెస్ చూడండి.',
  },
}

export const fill = (s: string, p: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m))
export const digestLabel = (lang: DigestLocale, key: string): string => L[lang][key] ?? L.en[key] ?? key

const INTL: Record<DigestLocale, string> = { en: 'en-GB', hi: 'hi-IN', te: 'te-IN' }
/** "3 Nov 2026" in the language (UTC; ASCII digits so fact checks stay simple). */
export function fmtDate(iso: string | null | undefined, lang: DigestLocale): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(`${INTL[lang]}-u-nu-latn`, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  } catch {
    return new Date(iso).toISOString().slice(0, 10)
  }
}
/** Digest day "2026-10-23" → "23 October 2026" in the language. */
export function fmtDay(date: string, lang: DigestLocale): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(`${INTL[lang]}-u-nu-latn`, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const firstSentences = (s: string, max = 220): string => {
  const parts = s.replace(/\s+/g, ' ').trim().match(/[^.!?।]+[.!?।]?/g) || []
  let out = ''
  for (const p of parts) {
    if ((out + p).length > max) break
    out += p
    if (out.split(/[.!?।]/).filter((x) => x.trim()).length >= 2) break
  }
  return (out || s.slice(0, max)).trim()
}

/**
 * Template summary: 1–2 lines from the item's own data only (no AI). English
 * leads with the source's own summary; Hindi / Telugu build a sentence from
 * the facts (the source summary is English text). Pure.
 */
export function templateSummary(c: Pick<DigestItem, 'category' | 'summary' | 'deadline' | 'starts_at' | 'ends_at' | 'prize_text' | 'mode' | 'city' | 'level' | 'source_name'>, lang: DigestLocale): string {
  const t = (k: string, p: Record<string, string | number> = {}) => fill(digestLabel(lang, k), p)
  const facts: string[] = []
  if (c.deadline) facts.push(t('closes_in', { date: fmtDate(c.deadline, lang) }))
  else if (c.starts_at && c.ends_at && c.ends_at.slice(0, 10) !== c.starts_at.slice(0, 10)) facts.push(t('runs', { from: fmtDate(c.starts_at, lang), to: fmtDate(c.ends_at, lang) }))
  else if (c.starts_at) facts.push(t('starts_on', { date: fmtDate(c.starts_at, lang) }))
  if (c.prize_text) facts.push(t('prizes', { prize: c.prize_text }))
  if (lang === 'en' && c.summary) return firstSentences(`${firstSentences(c.summary, 200)} ${facts[0] || ''}`, 260)
  if (c.category === 'news') return t('news_line', { source: c.source_name })
  if (c.category === 'learn') return c.level ? t('learn_line', { level: c.level }) : t('learn_line_nolevel')
  if (c.category === 'platform') return t('platform_line')
  const mode = c.mode ? digestLabel(lang, c.mode) : ''
  const head = `${[mode, digestLabel(lang, c.category)].filter(Boolean).join(' ')}${c.city ? ` ${t('in_city', { city: c.city })}` : ''}.`
  return [head.charAt(0).toUpperCase() + head.slice(1), ...facts].join(' ').slice(0, 260)
}

export interface Chip { key: string; label: string; value: string }

/** Key-fact chips for a card: date, deadline, prize, mode, region. Pure. */
export function itemChips(it: Pick<DigestItem, 'starts_at' | 'deadline' | 'prize_text' | 'mode' | 'region' | 'city' | 'group'>, lang: DigestLocale): Chip[] {
  const out: Chip[] = []
  if (it.starts_at) out.push({ key: 'starts', label: digestLabel(lang, 'starts'), value: fmtDate(it.starts_at, lang) })
  if (it.deadline) out.push({ key: 'deadline', label: digestLabel(lang, 'deadline'), value: fmtDate(it.deadline, lang) })
  if (it.prize_text) out.push({ key: 'prize', label: digestLabel(lang, 'prize'), value: it.prize_text })
  if (it.mode) out.push({ key: 'mode', label: '', value: digestLabel(lang, it.mode) })
  if (it.group === 'events' || it.group === 'contests') out.push({ key: 'region', label: '', value: it.city || digestLabel(lang, it.region) })
  return out
}

export interface RenderedItem {
  key: string
  rank: number
  category: DigestCategory
  title: string
  summary: string
  summary_ai: boolean
  url: string
  source_url: string | null
  source_name: string
  topic: string | null
  chips: Chip[]
}

export interface RenderedSection { category: DigestCategory; heading: string; items: RenderedItem[] }

export interface RenderedDigest {
  date: string
  lang: DigestLocale
  heading: string
  date_label: string
  intro: string
  outro: string
  count: number
  sections: RenderedSection[]
}

/** The best summary for a language: its own, else the template one (never another language's AI text). */
export function summaryFor(it: DigestItem, lang: DigestLocale): { text: string; ai: boolean } {
  const s = it.summaries?.[lang]
  if (s?.text?.trim()) return { text: s.text, ai: s.ai }
  return { text: templateSummary(it, lang), ai: false }
}

/** Digest → sections per category with item cards, in a language. Pure. */
export function renderDigest(doc: Pick<DigestDoc, 'date' | 'items'>, lang: DigestLocale, tpls: DigestTemplates = DEFAULT_TEMPLATES): RenderedDigest {
  const tpl = tpls[lang] || DEFAULT_TEMPLATES[lang]
  const sections: RenderedSection[] = []
  for (const category of DIGEST_CATEGORIES) {
    const items = doc.items.filter((i) => i.category === category).sort((a, b) => a.rank - b.rank)
    if (!items.length) continue
    sections.push({
      category,
      heading: tpl.sections[category],
      items: items.map((i) => {
        const s = summaryFor(i, lang)
        return { key: i.key, rank: i.rank, category, title: i.title, summary: s.text, summary_ai: s.ai, url: i.url, source_url: i.source_url, source_name: i.source_name, topic: i.topic, chips: itemChips(i, lang) }
      }),
    })
  }
  const dateLabel = fmtDay(doc.date, lang)
  return { date: doc.date, lang, heading: fill(tpl.heading, { date: dateLabel }), date_label: dateLabel, intro: tpl.intro, outro: tpl.outro, count: doc.items.length, sections }
}

// ─── Email / WhatsApp / RSS text ────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const utm = (url: string, medium: string) => {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'digest')
    u.searchParams.set('utm_medium', medium)
    u.searchParams.set('utm_campaign', 'daily_digest')
    return u.toString()
  } catch {
    return url
  }
}

export function digestPageUrl(origin: string, date: string, lang: DigestLocale): string {
  return `${origin.replace(/\/+$/, '')}${lang === 'en' ? '' : `/${lang}`}/digest/${date}`
}

/** Email body (inside the subscriptions shell, which adds manage + unsubscribe). Pure. */
export function digestEmailHtml(r: RenderedDigest, origin: string, maxPerSection = 4): string {
  const sections = r.sections.map((s) => {
    const rows = s.items.slice(0, maxPerSection).map((i) => `<tr><td style="padding:12px 0;border-top:1px solid #e3e7f1">
  <a href="${esc(utm(i.url, 'email'))}" style="display:block;font-size:16px;font-weight:600;color:#2F5BE7;text-decoration:none">${esc(i.title)}</a>
  <div style="margin-top:4px;font-size:14px;line-height:1.5;color:#0f1729">${esc(i.summary)}</div>
  ${i.chips.length ? `<div style="margin-top:6px;font-size:12px;color:#4b5563">${esc(i.chips.map((c) => (c.label ? `${c.label}: ${c.value}` : c.value)).join(' · '))}</div>` : ''}
  <div style="margin-top:4px;font-size:12px;color:#4b5563">${esc(digestLabel(r.lang, 'source'))}: ${esc(i.source_name)}</div>
</td></tr>`).join('')
    return `<h2 style="margin:20px 0 4px;font-size:17px;color:#0f1729">${esc(s.heading)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
  }).join('')
  return `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">${esc(r.intro)}</p>${sections}
<p style="margin:16px 0 0"><a href="${esc(utm(digestPageUrl(origin, r.date, r.lang), 'email'))}" style="color:#2F5BE7">${esc(fill(digestLabel(r.lang, 'items_count'), { count: r.count }))}</a></p>
<p style="margin:12px 0 0;font-size:12px;color:#4b5563">${esc(r.outro)}</p>`
}

const STOP: Record<DigestLocale, string> = { en: 'Reply STOP to stop these messages.', hi: 'ये मैसेज बंद करने के लिए STOP लिखें।', te: 'ఈ మెసేజ్‌లు ఆపడానికి STOP అని రిప్లై చేయండి.' }

/** WhatsApp text: heading, top 5, link, STOP line. Pure. */
export function digestWhatsAppText(r: RenderedDigest, origin: string): string {
  const top = r.sections.flatMap((s) => s.items).sort((a, b) => a.rank - b.rank).slice(0, 5).map((i) => `• ${i.title}`)
  return [r.heading, ...top, utm(digestPageUrl(origin, r.date, r.lang), 'whatsapp'), '', STOP[r.lang]].join('\n')
}

/** Per-category mini roundup (title + items) for share cards and captions. Pure. */
export function categoryRoundup(r: RenderedDigest, category: DigestCategory): { heading: string; items: RenderedItem[] } | null {
  const s = r.sections.find((x) => x.category === category)
  return s ? { heading: `${s.heading} · ${r.date_label}`, items: s.items } : null
}

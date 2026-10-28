/**
 * SEO-045: the support assistant's "your records" lines as data — a key, values
 * and ISO dates — rendered per language (pure, no server imports). The prompt
 * always gets the English rendering (the model answers in the user's language);
 * the fallback card shows the user's language with dates in their locale, so a
 * Hindi / Telugu user never gets an English-only reply when the AI is off,
 * capped or the question was flagged.
 */
import { formatDate } from '@/lib/i18n/format'
import type { SupportLocale } from './policy'

export type FactKey =
  | 'plan' | 'pastDue' | 'noSubscription' | 'credits' | 'creditsResets'
  | 'testScored' | 'testPending' | 'invite' | 'inviteNoExpiry' | 'noTests'
  | 'ticket' | 'noTickets'
  | 'studyPlan' | 'reminders' | 'focus' | 'noStudyPlan'
  | 'order' | 'noOrders' | 'org'

type Value = string | number
export interface SupportFact {
  key: FactKey
  /** Plain values (already clipped). `{ e: name }` values are enum words translated per language. */
  params?: Record<string, Value | { e: string }>
  /** ISO dates, formatted in the reader's locale. */
  dates?: Record<string, string | null | undefined>
}

type Table = Record<FactKey, string> & Record<string, string>

const en: Table = {
  plan: 'Plan: {plan}; state {state}; current period ends {ends}; {renew}.',
  pastDue: 'The last renewal payment failed; access continues until the grace period ends. Updating the payment method on Billing fixes it.',
  noSubscription: 'No paid subscription on this account (free plan).',
  credits: 'AI credits: {balance} left of {allowance} on {plan}.',
  creditsResets: 'AI credits: {balance} left of {allowance} on {plan}, resets {resets}.',
  testScored: 'Test "{title}" submitted {date}; score {score} of {max}.',
  testPending: 'Test "{title}" submitted {date}; score not released yet (the organiser releases it).',
  invite: 'Open test invite: "{title}", expires {expires}.',
  inviteNoExpiry: 'Open test invite: "{title}", no expiry date.',
  noTests: 'No test submissions or open test invites on this account.',
  ticket: 'Ticket "{subject}": {status}, opened {opened}, last update {updated}.',
  noTickets: 'No support tickets yet.',
  studyPlan: 'Study plan for {target} ({status}), week {week}: {done} of {total} items done.',
  reminders: 'Reminders: email {email}, WhatsApp {whatsapp}, at {hour}:00 {tz}.',
  focus: 'Focus areas: {areas}.',
  noStudyPlan: 'No study plan yet (create one on Study plan).',
  order: 'Order {number}: {status}, payment {payment}, placed {placed}.',
  noOrders: 'No marketplace orders on this account.',
  org: "Your organisation's plan: {plan}. Assessments this month: {used} of {limit}. Seats in use: {seats} of {seatLimit}.",
  'e.active': 'active', 'e.trialing': 'trial', 'e.past_due': 'payment overdue', 'e.cancelled': 'cancelled', 'e.expired': 'expired',
  'e.renews': 'renews automatically', 'e.noRenew': 'will not renew', 'e.prepaid': 'prepaid (does not renew by itself)',
  'e.on': 'on', 'e.off': 'off', 'e.unlimited': 'unlimited', 'e.aTest': 'a test', 'e.unknownDate': 'unknown date',
  'e.open': 'open', 'e.pending': 'pending', 'e.in_progress': 'in progress', 'e.resolved': 'resolved', 'e.closed': 'closed',
  'e.paid': 'paid', 'e.failed': 'failed', 'e.refunded': 'refunded', 'e.processing': 'processing', 'e.shipped': 'shipped', 'e.delivered': 'delivered', 'e.completed': 'completed',
  'e.paused': 'paused', 'e.archived': 'archived',
}

const hi: Table = {
  plan: 'प्लान: {plan}; स्थिति {state}; मौजूदा अवधि {ends} को खत्म; {renew}।',
  pastDue: 'पिछला रिन्यूअल भुगतान विफल रहा; ग्रेस अवधि खत्म होने तक एक्सेस जारी रहेगा। बिलिंग पर भुगतान का तरीका अपडेट करने से यह ठीक हो जाएगा।',
  noSubscription: 'इस खाते पर कोई सशुल्क सब्सक्रिप्शन नहीं (मुफ़्त प्लान)।',
  credits: 'AI क्रेडिट: {plan} पर {allowance} में से {balance} बाकी।',
  creditsResets: 'AI क्रेडिट: {plan} पर {allowance} में से {balance} बाकी, {resets} को रीसेट।',
  testScored: 'टेस्ट "{title}" {date} को जमा; स्कोर {max} में से {score}।',
  testPending: 'टेस्ट "{title}" {date} को जमा; स्कोर अभी जारी नहीं हुआ (आयोजक इसे जारी करते हैं)।',
  invite: 'खुला टेस्ट निमंत्रण: "{title}", {expires} को समाप्त।',
  inviteNoExpiry: 'खुला टेस्ट निमंत्रण: "{title}", कोई समाप्ति तिथि नहीं।',
  noTests: 'इस खाते पर कोई टेस्ट जमा या खुला टेस्ट निमंत्रण नहीं।',
  ticket: 'टिकट "{subject}": {status}, {opened} को खोला, आख़िरी अपडेट {updated}।',
  noTickets: 'अभी कोई सपोर्ट टिकट नहीं।',
  studyPlan: '{target} के लिए स्टडी प्लान ({status}), सप्ताह {week}: {total} में से {done} आइटम पूरे।',
  reminders: 'रिमाइंडर: ईमेल {email}, WhatsApp {whatsapp}, {hour}:00 {tz} पर।',
  focus: 'फ़ोकस क्षेत्र: {areas}।',
  noStudyPlan: 'अभी कोई स्टडी प्लान नहीं (स्टडी प्लान पर एक बनाएँ)।',
  order: 'ऑर्डर {number}: {status}, भुगतान {payment}, {placed} को दिया।',
  noOrders: 'इस खाते पर कोई मार्केटप्लेस ऑर्डर नहीं।',
  org: 'आपके संगठन का प्लान: {plan}। इस महीने के असेसमेंट: {limit} में से {used}। इस्तेमाल में सीटें: {seatLimit} में से {seats}।',
  'e.active': 'सक्रिय', 'e.trialing': 'ट्रायल', 'e.past_due': 'भुगतान बाकी', 'e.cancelled': 'रद्द', 'e.expired': 'समाप्त',
  'e.renews': 'अपने-आप रिन्यू होता है', 'e.noRenew': 'रिन्यू नहीं होगा', 'e.prepaid': 'प्रीपेड (अपने-आप रिन्यू नहीं होता)',
  'e.on': 'चालू', 'e.off': 'बंद', 'e.unlimited': 'असीमित', 'e.aTest': 'एक टेस्ट', 'e.unknownDate': 'अज्ञात तिथि',
  'e.open': 'खुला', 'e.pending': 'बाकी', 'e.in_progress': 'जारी', 'e.resolved': 'हल हुआ', 'e.closed': 'बंद',
  'e.paid': 'भुगतान हुआ', 'e.failed': 'विफल', 'e.refunded': 'रिफ़ंड हुआ', 'e.processing': 'प्रोसेस हो रहा', 'e.shipped': 'भेजा गया', 'e.delivered': 'पहुँचा', 'e.completed': 'पूरा',
  'e.paused': 'रुका', 'e.archived': 'संग्रहित',
}

const te: Table = {
  plan: 'ప్లాన్: {plan}; స్థితి {state}; ప్రస్తుత వ్యవధి {ends}న ముగుస్తుంది; {renew}.',
  pastDue: 'చివరి రిన్యూవల్ చెల్లింపు విఫలమైంది; గ్రేస్ వ్యవధి ముగిసే వరకు యాక్సెస్ కొనసాగుతుంది. బిల్లింగ్‌లో చెల్లింపు పద్ధతిని అప్‌డేట్ చేస్తే సరిపోతుంది.',
  noSubscription: 'ఈ అకౌంట్‌లో చెల్లింపు సబ్‌స్క్రిప్షన్ లేదు (ఉచిత ప్లాన్).',
  credits: 'AI క్రెడిట్‌లు: {plan}లో {allowance}లో {balance} మిగిలాయి.',
  creditsResets: 'AI క్రెడిట్‌లు: {plan}లో {allowance}లో {balance} మిగిలాయి, {resets}న రీసెట్.',
  testScored: 'టెస్ట్ "{title}" {date}న సమర్పించారు; స్కోర్ {max}కు {score}.',
  testPending: 'టెస్ట్ "{title}" {date}న సమర్పించారు; స్కోర్ ఇంకా విడుదల కాలేదు (నిర్వాహకులు విడుదల చేస్తారు).',
  invite: 'తెరిచి ఉన్న టెస్ట్ ఆహ్వానం: "{title}", గడువు {expires}.',
  inviteNoExpiry: 'తెరిచి ఉన్న టెస్ట్ ఆహ్వానం: "{title}", గడువు తేదీ లేదు.',
  noTests: 'ఈ అకౌంట్‌లో టెస్ట్ సమర్పణలు లేదా తెరిచి ఉన్న టెస్ట్ ఆహ్వానాలు లేవు.',
  ticket: 'టికెట్ "{subject}": {status}, {opened}న తెరిచారు, చివరి అప్‌డేట్ {updated}.',
  noTickets: 'ఇంకా సపోర్ట్ టికెట్‌లు లేవు.',
  studyPlan: '{target} కోసం స్టడీ ప్లాన్ ({status}), వారం {week}: {total}లో {done} అంశాలు పూర్తయ్యాయి.',
  reminders: 'రిమైండర్‌లు: ఈమెయిల్ {email}, WhatsApp {whatsapp}, {hour}:00 {tz}కు.',
  focus: 'దృష్టి పెట్టాల్సిన అంశాలు: {areas}.',
  noStudyPlan: 'ఇంకా స్టడీ ప్లాన్ లేదు (స్టడీ ప్లాన్‌లో ఒకటి సృష్టించండి).',
  order: 'ఆర్డర్ {number}: {status}, చెల్లింపు {payment}, {placed}న చేశారు.',
  noOrders: 'ఈ అకౌంట్‌లో మార్కెట్‌ప్లేస్ ఆర్డర్‌లు లేవు.',
  org: 'మీ సంస్థ ప్లాన్: {plan}. ఈ నెల అసెస్‌మెంట్‌లు: {limit}లో {used}. వాడుతున్న సీట్లు: {seatLimit}లో {seats}.',
  'e.active': 'చురుకుగా', 'e.trialing': 'ట్రయల్', 'e.past_due': 'చెల్లింపు బాకీ', 'e.cancelled': 'రద్దయింది', 'e.expired': 'గడువు ముగిసింది',
  'e.renews': 'ఆటోమేటిక్‌గా రిన్యూ అవుతుంది', 'e.noRenew': 'రిన్యూ కాదు', 'e.prepaid': 'ప్రీపెయిడ్ (దానంతట అదే రిన్యూ కాదు)',
  'e.on': 'ఆన్', 'e.off': 'ఆఫ్', 'e.unlimited': 'అపరిమితం', 'e.aTest': 'ఒక టెస్ట్', 'e.unknownDate': 'తెలియని తేదీ',
  'e.open': 'తెరిచి ఉంది', 'e.pending': 'పెండింగ్', 'e.in_progress': 'జరుగుతోంది', 'e.resolved': 'పరిష్కరించారు', 'e.closed': 'మూసివేశారు',
  'e.paid': 'చెల్లించారు', 'e.failed': 'విఫలమైంది', 'e.refunded': 'రీఫండ్ అయింది', 'e.processing': 'ప్రాసెస్ అవుతోంది', 'e.shipped': 'పంపారు', 'e.delivered': 'అందింది', 'e.completed': 'పూర్తయింది',
  'e.paused': 'నిలిపివేశారు', 'e.archived': 'ఆర్కైవ్ చేశారు',
}

export const FACT_TABLES: Record<SupportLocale, Table> = { en, hi, te }

/** One fact in `locale` (English fallback per key; unknown enum words stay as stored). Pure. */
export function renderFact(f: SupportFact, locale: SupportLocale): string {
  const table = FACT_TABLES[locale] ?? en
  const tpl = table[f.key] ?? en[f.key] ?? f.key
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(f.params ?? {})) {
    values[k] = typeof v === 'object' ? table[`e.${v.e}`] ?? en[`e.${v.e}`] ?? v.e.replace(/_/g, ' ') : String(v)
  }
  for (const [k, iso] of Object.entries(f.dates ?? {})) {
    values[k] = typeof iso === 'string' && iso && !Number.isNaN(Date.parse(iso))
      ? (locale === 'en' ? iso.slice(0, 10) : formatDate(locale, iso, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))
      : table['e.unknownDate']
  }
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m))
}

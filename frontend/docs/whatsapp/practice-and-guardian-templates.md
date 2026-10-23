# WhatsApp templates: daily practice and guardian reports

WhatsApp practice (`lib/wa-practice`) and guardian reports (`lib/guardian`) send
through the official Meta Cloud API number configured in Admin → Hiring →
screening (WhatsApp). Inside Meta's 24-hour window (the person wrote to us in
the last 24 h) questions go out as interactive reply buttons / lists. Outside
it only **approved templates** can be sent, so create these in WhatsApp
Manager → Message templates. Without Meta configured, messages go to the
simulated outbox (dev and tests).

Language: the template is sent in the recipient's language (`hi`, `te`) when
that language is listed in Admin → Automations → "Approved template languages",
else in the base language, with one retry in the base language if Meta reports
a missing translation (`lib/wa-practice/transport.ts`). Add each template in
English, Hindi and Telugu under the **same name**. Body variables are clipped
to 60 characters by the sender.

Template names for practice can be changed (superadmin `PUT
/api/admin/wa-practice/settings`, `templates.{optin,daily,mock}`); the
guardian template names are fixed.

## Practice

| Name | Category | Body variables | Buttons (quick reply, in this order) |
|---|---|---|---|
| `cs_practice_optin` | Utility | {{1}} domain | `Yes, join` (payload `wp:join`), `No thanks` (`wp:no`) |
| `cs_practice_daily` | Utility | {{1}} domain, {{2}} level | `Get a question` (`wp:get`), `Stop` (`wp:stop`) |
| `cs_practice_mock` | Utility | {{1}} domain, {{2}} number of questions | `Start mock` (`wp:mock`), `Stop` (`wp:stop`) |

The payloads are set per send; in WhatsApp Manager just add two quick-reply
buttons with these titles. Suggested bodies:

| Name | English | Hindi (hi) | Telugu (te) |
|---|---|---|---|
| `cs_practice_optin` | `You asked CodeSpectra for a daily {{1}} practice question on WhatsApp. Tap "Yes, join" to confirm. Reply STOP any time to stop.` | `आपने CodeSpectra से WhatsApp पर रोज़ {{1}} का अभ्यास प्रश्न माँगा है। पुष्टि के लिए "Yes, join" दबाएँ। बंद करने के लिए कभी भी STOP लिखें।` | `మీరు CodeSpectra నుండి WhatsAppలో రోజూ {{1}} ప్రాక్టీస్ ప్రశ్న అడిగారు. నిర్ధారించడానికి "Yes, join" నొక్కండి. ఆపడానికి ఎప్పుడైనా STOP పంపండి.` |
| `cs_practice_daily` | `Your daily {{1}} question ({{2}}) is ready. Tap "Get a question" to answer it here.` | `आपका आज का {{1}} प्रश्न ({{2}}) तैयार है। यहीं जवाब देने के लिए "Get a question" दबाएँ।` | `మీ ఈరోజు {{1}} ప్రశ్న ({{2}}) సిద్ధంగా ఉంది. ఇక్కడే జవాబివ్వడానికి "Get a question" నొక్కండి.` |
| `cs_practice_mock` | `Your weekly {{1}} mini mock is ready: {{2}} questions, score at the end.` | `आपका साप्ताहिक {{1}} मिनी मॉक तैयार है: {{2}} प्रश्न, आख़िर में स्कोर।` | `మీ వారపు {{1}} మినీ మాక్ సిద్ధం: {{2}} ప్రశ్నలు, చివర్లో స్కోరు.` |

Flow: double opt-in (consent checkbox in Settings → WhatsApp practice, then
the opt-in template reply from that phone). Daily prompt at the learner's hour
(never inside quiet hours, default 21:00–08:00 local), once per local day, at
most `daily_cap` questions a day; weekly mock on `mock_weekday` (default
Sunday). Commands: STOP / START, NEXT, MOCK, LANG en|hi|te, LEVEL
easy|medium|hard, TOPIC [name], HELP. Inbound is limited per number
(`inbound_per_10min`, default 30) and handled once per Meta message id
(`wa:practice:<id>` in the existing signed webhook
`/api/ats/screening/webhooks/whatsapp`).

## Guardian reports

| Name | Category | Body variables | Buttons |
|---|---|---|---|
| `cs_guardian_verify` | Authentication (copy code) | {{1}} 6-digit code | Meta's copy-code button |
| `cs_guardian_invite` | Utility | {{1}} learner first name, {{2}} invite link | — |
| `cs_guardian_weekly` | Utility | {{1}} learner, {{2}} week, {{3}} practice minutes, {{4}} tests (avg %), {{5}} streak days, {{6}} study plan % | — |

`cs_guardian_verify` is only sent for learners under 18 (the invite link goes
by email, the code by WhatsApp). `cs_guardian_invite` is only used when the
guardian has a phone and no email. A "—" means the learner doesn't share that
item. Suggested `cs_guardian_weekly` bodies:

- en: `Weekly CodeSpectra progress for {{1}} ({{2}}): practice about {{3}} min, tests {{4}}, streak {{5}} days, study plan {{6}}. Reply STOP to stop these messages.`
- hi: `{{1}} की साप्ताहिक CodeSpectra प्रगति ({{2}}): लगभग {{3}} मिनट अभ्यास, टेस्ट {{4}}, स्ट्रीक {{5}} दिन, स्टडी प्लान {{6}}। बंद करने के लिए STOP लिखें।`
- te: `{{1}} వారపు CodeSpectra పురోగతి ({{2}}): దాదాపు {{3}} నిమిషాల ప్రాక్టీస్, టెస్ట్‌లు {{4}}, స్ట్రీక్ {{5}} రోజులు, స్టడీ ప్లాన్ {{6}}. ఆపడానికి STOP పంపండి.`

Reports never contain answers, question text, proctoring snapshots, integrity
flags or unreleased scores. Every email has a one-click unsubscribe
(`/guardian/unsubscribe`, `List-Unsubscribe-Post`); a STOP from the guardian's
phone stops WhatsApp reports through the platform opt-out list.

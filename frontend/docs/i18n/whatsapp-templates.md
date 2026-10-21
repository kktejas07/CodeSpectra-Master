# WhatsApp templates in Hindi and Telugu

Meta delivers a template only in a language it was approved in, under the
same template name. CodeSpectra picks the language per recipient
(`lib/i18n/whatsapp-language.ts`):

1. the recipient's interface language (profile `ui_locale`: `hi` or `te`),
   **if** that language is listed in Admin → Automations → "Approved template
   languages" (`wa_template_locales`);
2. otherwise the base language (Admin → Automations → "WhatsApp template base
   language", `wa_template_language`, e.g. `en` or `en_US`).

If Meta still answers "template does not exist in the translation" (132001),
the message is sent once more in the base language.

## What to create in Meta Business Manager

For each template name you configured in Admin → Automations, open WhatsApp
Manager → Message templates → the template → **Add language** → Hindi (`hi`)
and Telugu (`te`). Keep the same category and the same number of `{{n}}`
variables. Suggested bodies (edit freely; keep the variables):

| Setting | Variables | Hindi (hi) | Telugu (te) |
|---|---|---|---|
| `wa_template_notification` (e.g. `notification_update`) | {{1}} title, {{2}} message, {{3}} link | `*{{1}}*` ⏎ `{{2}}` ⏎ `यहाँ देखें: {{3}}` | `*{{1}}*` ⏎ `{{2}}` ⏎ `ఇక్కడ చూడండి: {{3}}` |
| `wa_template_hiring` (e.g. `hiring_update`) | {{1}} title, {{2}} message, {{3}} link | `*{{1}}*` ⏎ `{{2}}` ⏎ `विवरण: {{3}}` | `*{{1}}*` ⏎ `{{2}}` ⏎ `వివరాలు: {{3}}` |
| `wa_template_newsletter` (e.g. `newsletter_update`, Marketing) | {{1}} title, {{2}} message, {{3}} link | `*{{1}}*` ⏎ `{{2}}` ⏎ `पूरा पढ़ें: {{3}}` ⏎ `बंद करने के लिए STOP लिखें।` | `*{{1}}*` ⏎ `{{2}}` ⏎ `పూర్తిగా చదవండి: {{3}}` ⏎ `ఆపడానికి STOP అని పంపండి.` |
| `wa_template_payment` (e.g. `payment_reminder`) | {{1}} name, {{2}} date | `नमस्ते {{1}}, आपका CodeSpectra पेमेंट नहीं हो सका। {{2}} तक अपना पेमेंट तरीका अपडेट करें ताकि access बना रहे।` | `హాయ్ {{1}}, మీ CodeSpectra పేమెంట్ జరగలేదు. యాక్సెస్ కొనసాగడానికి {{2}} లోపు మీ పేమెంట్ విధానాన్ని అప్‌డేట్ చేయండి.` |
| `wa_template_event` (e.g. `event_reminder`) | {{1}} event name, {{2}} time left | `{{1}} {{2}} में शुरू होगा। अपनी टीम तैयार रखें!` | `{{1}} {{2}}లో మొదలవుతుంది. మీ టీమ్‌ను సిద్ధం చేయండి!` |

After Meta approves a language, add it to "Approved template languages"
(`hi, te`) and save. Until then everyone keeps getting the base language.

Notes:

- The values filled into the variables come from the in-app notification,
  which is already written in the recipient's language. Dates and the
  "time left" value in the payment and event templates are still English
  (`21 Oct 2026`, `1 hour`).
- Not covered by this setting: the events-feed subscription templates
  (Admin → Events feed → Settings has its own template language) and the
  hiring screening flow (Settings → Hiring integrations). They stay in the
  language configured there.

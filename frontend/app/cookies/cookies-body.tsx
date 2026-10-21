/** Cookies text (English only — see components/public/legal-shell.tsx). */

export function CookiesBody() {
  return (
      <article className="mx-auto max-w-[72ch] space-y-12 px-4 py-14 text-[15px] leading-7 text-cs-ink-soft sm:px-6 lg:py-20">

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">1. What Are Cookies</h2>
          <p>
            Cookies are small text files placed on your device when you visit a website. They help us
            recognize your device, remember your preferences, and understand how you use the Service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">2. How We Use Cookies</h2>
          <p>We use cookies and similar technologies for the following purposes:</p>

          <div className="overflow-x-auto rounded-2xl border border-cs-grid">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-cs-grid bg-cs-accent/5">
                  <th className="px-4 py-3 font-semibold text-cs-ink">Category</th>
                  <th className="px-4 py-3 font-semibold text-cs-ink">Type</th>
                  <th className="px-4 py-3 font-semibold text-cs-ink">Purpose</th>
                  <th className="px-4 py-3 font-semibold text-cs-ink">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cs-grid">
                <tr>
                  <td className="px-4 py-3 align-top">Authentication</td>
                  <td className="px-4 py-3 align-top">Essential</td>
                  <td className="px-4 py-3 align-top">Keeps you logged in and maintains your session</td>
                  <td className="px-4 py-3 align-top">30 days or until logout</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 align-top">Security</td>
                  <td className="px-4 py-3 align-top">Essential</td>
                  <td className="px-4 py-3 align-top">Protects against cross-site request forgery attacks</td>
                  <td className="px-4 py-3 align-top">Session</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 align-top">UI Preferences</td>
                  <td className="px-4 py-3 align-top">Functional</td>
                  <td className="px-4 py-3 align-top">Remembers your theme, language, and layout settings</td>
                  <td className="px-4 py-3 align-top">1 year</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 align-top">Admin session</td>
                  <td className="px-4 py-3 align-top">Essential</td>
                  <td className="px-4 py-3 align-top">Supports administrative impersonation for troubleshooting (admin accounts only)</td>
                  <td className="px-4 py-3 align-top">Session duration</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 align-top">Your cookie choices</td>
                  <td className="px-4 py-3 align-top">Essential</td>
                  <td className="px-4 py-3 align-top">Remembers which optional categories you allowed (cs_consent)</td>
                  <td className="px-4 py-3 align-top">1 year</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 align-top">Product analytics</td>
                  <td className="px-4 py-3 align-top">Optional (analytics)</td>
                  <td className="px-4 py-3 align-top">A random id on your device (cs_aid, cs_sid) so we can see which pages and features help. Without your consent we only count visits, using a daily-changing code on our server that cannot identify you</td>
                  <td className="px-4 py-3 align-top">Until you withdraw consent; session id 30 minutes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 align-top">Analytics tools</td>
                  <td className="px-4 py-3 align-top">Optional (analytics)</td>
                  <td className="px-4 py-3 align-top">Google Analytics, Google Tag Manager, PostHog or Microsoft Clarity, if we enable them</td>
                  <td className="px-4 py-3 align-top">Set by each provider</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 align-top">Advertising</td>
                  <td className="px-4 py-3 align-top">Optional (marketing)</td>
                  <td className="px-4 py-3 align-top">Meta Pixel or LinkedIn Insight, if we enable them, to measure ad visits and sign-ups</td>
                  <td className="px-4 py-3 align-top">Set by each provider</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">3. Essential Cookies</h2>
          <p>
            Essential cookies are required for the Service to function. These include authentication
            session tokens, CSRF protection tokens, and session identifiers. You cannot opt out of
            essential cookies as the Service will not work without them.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">4. Third-Party Cookies</h2>
          <p>The Service may include cookies from third-party services:</p>
          <ul className="list-disc space-y-2 pl-5 marker:text-cs-accent-text">
            <li><strong className="font-semibold text-cs-ink">Authentication cookies:</strong> Session cookies for Google/GitHub sign-in</li>
            <li><strong className="font-semibold text-cs-ink">Razorpay:</strong> Payment processing cookies (only if billing features are used)</li>
            <li><strong className="font-semibold text-cs-ink">Analytics and advertising:</strong> Only after you allow them in the cookie banner or Cookie settings</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">5. Managing Cookies</h2>
          <p>
            Optional cookies are off until you allow them. Change or withdraw your choice at any time from{' '}
            <button type="button" data-cookie-settings className="font-semibold text-cs-accent-text underline-offset-4 hover:underline">Cookie settings</button>
            {' '}(also linked in the footer) — withdrawing is as easy as giving consent and deletes our analytics id from your device.
          </p>
          <p>You can manage cookies through your browser settings:</p>
          <ul className="list-disc space-y-2 pl-5 marker:text-cs-accent-text">
            <li><strong className="font-semibold text-cs-ink">Chrome:</strong> Settings → Privacy and Security → Cookies</li>
            <li><strong className="font-semibold text-cs-ink">Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
            <li><strong className="font-semibold text-cs-ink">Safari:</strong> Preferences → Privacy → Manage Website Data</li>
          </ul>
          <p>
            Blocking essential cookies will prevent login and core functionality from working.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">6. Do Not Track (DNT)</h2>
          <p>
            We respect Do Not Track and Global Privacy Control signals. When either is detected,
            optional analytics stays off unless you turn it on yourself, and advertising cookies are never set. The Service continues to function normally with only
            essential cookies.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">7. Data Collected by Cookies</h2>
          <p>When you visit the Service, we may collect:</p>
          <ul className="list-disc space-y-2 pl-5 marker:text-cs-accent-text">
            <li>IP address (for rate limiting and abuse prevention)</li>
            <li>Browser type and version</li>
            <li>Pages visited and time spent on each page</li>
            <li>Referring URL (if applicable)</li>
            <li>Web Vitals metrics (CLS, FCP, LCP) — collected anonymously for performance optimization</li>
          </ul>
          <p>
            This data is aggregated and anonymized. We do not sell or share it with third parties
            for advertising purposes.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">8. Changes to This Policy</h2>
          <p>
            We may update this Cookie Policy from time to time. Material changes will be notified
            via the Service. Continued use after changes take effect constitutes acceptance of
            the revised policy.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="scroll-mt-24 border-b border-cs-grid pb-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">9. Contact</h2>
          <p>Questions about this Cookie Policy? Contact us at:</p>
          <p className="font-medium text-cs-ink">privacy@codespectra.ai</p>
        </section>
      </article>
  )
}

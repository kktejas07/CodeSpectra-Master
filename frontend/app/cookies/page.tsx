import { PublicPageWrapper } from '@/app/public-layout'

export default function CookiesPage() {
  return (
    <PublicPageWrapper>
      <article className="mx-auto max-w-3xl space-y-8 py-12 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-foreground">Cookie Policy</h1>
          <p className="text-xs text-muted-foreground/70">Last updated: August 9, 2026</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">1. What Are Cookies</h2>
          <p>
            Cookies are small text files placed on your device when you visit a website. They help us
            recognize your device, remember your preferences, and understand how you use the Service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">2. How We Use Cookies</h2>
          <p>We use cookies and similar technologies for the following purposes:</p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-muted-foreground/20 text-left">
              <thead>
                <tr className="border-b border-muted-foreground/20 bg-muted/30">
                  <th className="px-3 py-2 font-semibold text-foreground">Category</th>
                  <th className="px-3 py-2 font-semibold text-foreground">Type</th>
                  <th className="px-3 py-2 font-semibold text-foreground">Purpose</th>
                  <th className="px-3 py-2 font-semibold text-foreground">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted-foreground/10">
                <tr>
                  <td className="px-3 py-2">Authentication</td>
                  <td className="px-3 py-2">Essential</td>
                  <td className="px-3 py-2">Keeps you logged in and maintains your session</td>
                  <td className="px-3 py-2">30 days or until logout</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Security</td>
                  <td className="px-3 py-2">Essential</td>
                  <td className="px-3 py-2">Protects against cross-site request forgery attacks</td>
                  <td className="px-3 py-2">Session</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">UI Preferences</td>
                  <td className="px-3 py-2">Functional</td>
                  <td className="px-3 py-2">Remembers your theme, language, and layout settings</td>
                  <td className="px-3 py-2">1 year</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Admin Session</td>
                  <td className="px-3 py-2">Essential</td>
                  <td className="px-3 py-2">Supports administrative impersonation for troubleshooting (admin accounts only)</td>
                  <td className="px-3 py-2">Session duration</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">3. Essential Cookies</h2>
          <p>
            Essential cookies are required for the Service to function. These include authentication
            session tokens, CSRF protection tokens, and session identifiers. You cannot opt out of
            essential cookies as the Service will not work without them.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">4. Third-Party Cookies</h2>
          <p>The Service may include cookies from third-party services:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Firebase Auth:</strong> Google&apos;s authentication cookies for Google/GitHub sign-in</li>
            <li><strong>Razorpay:</strong> Payment processing cookies (only if billing features are used)</li>
            <li><strong>Analytics (Vercel/Web Vitals):</strong> Performance and usage data collection</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">5. Managing Cookies</h2>
          <p>You can manage cookies through your browser settings:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Chrome:</strong> Settings → Privacy and Security → Cookies</li>
            <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
            <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
          </ul>
          <p>
            Blocking essential cookies will prevent login and core functionality from working.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">6. Do Not Track (DNT)</h2>
          <p>
            We respect Do Not Track signals. When a DNT signal is detected, we disable analytics
            and non-essential tracking. The Service continues to function normally with only
            essential cookies.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">7. Data Collected by Cookies</h2>
          <p>When you visit the Service, we may collect:</p>
          <ul className="list-disc space-y-1 pl-5">
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
          <h2 className="text-xl font-semibold text-foreground">8. Changes to This Policy</h2>
          <p>
            We may update this Cookie Policy from time to time. Material changes will be notified
            via the Service. Continued use after changes take effect constitutes acceptance of
            the revised policy.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">9. Contact</h2>
          <p>Questions about this Cookie Policy? Contact us at:</p>
          <p className="text-foreground">privacy@codespectra.ai</p>
        </section>
      </article>
    </PublicPageWrapper>
  )
}

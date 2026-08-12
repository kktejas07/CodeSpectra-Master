import { PublicPageWrapper } from '@/app/public-layout'

export default function PrivacyPage() {
  return (
    <PublicPageWrapper>
      <article className="mx-auto max-w-3xl space-y-8 py-12 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-xs text-muted-foreground/70">Last updated: August 9, 2026</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">1. Introduction</h2>
          <p>
            CodeSpectra (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use
            our platform at codespectra.ai, including any associated browser extensions, mobile applications, or
            related services (collectively, the &quot;Service&quot;).
          </p>
          <p>
            By accessing or using the Service, you agree to the collection and use of information in accordance
            with this policy. If you do not agree, please discontinue use of the Service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>

          <h3 className="text-base font-semibold text-foreground">2.1 Account Information</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Name, email address, and profile image from your authentication provider (Google, GitHub, or email/password)</li>
            <li>Username and display name you set within the platform</li>
            <li>Organization or employer name if provided</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground">2.2 Usage and Activity Data</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Problems solved, submissions, and assessment results</li>
            <li>Feature usage patterns and navigation within the platform</li>
            <li>Workflows, challenges, and hackathon participation</li>
            <li>Chat messages and AI interactions within the platform</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground">2.3 Device and Hardware Data (via Chrome Extension)</h3>
          <p>
            The CodeSpectra Device Audit browser extension, used during proctored assessments, may collect:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Connected USB/HID/storage device identifiers (device name, vendor ID, product ID)</li>
            <li>Device classification (storage, HID, USB class)</li>
            <li>Hotplug events (device connect/disconnect timestamps)</li>
          </ul>
          <p>
            This data is used solely for exam integrity verification and is retained only for the duration of
            the proctored session plus 90 days for audit purposes.
          </p>

          <h3 className="text-base font-semibold text-foreground">2.4 Technical Data</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>IP address, browser type and version, operating system</li>
            <li>Device model and screen resolution (for proctoring identity verification)</li>
            <li>Web Vitals performance metrics (collected automatically)</li>
            <li>Error logs and crash reports</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">3. How We Use Your Information</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>To provide, maintain, and improve the Service</li>
            <li>To process assessments, submissions, and generate results</li>
            <li>To verify identity and maintain exam integrity during proctored sessions</li>
            <li>To detect and prevent fraud, abuse, and security incidents</li>
            <li>To communicate with you about account activity, updates, and support</li>
            <li>To generate anonymized analytics and usage statistics</li>
            <li>To comply with legal obligations</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">4. Data Sharing and Disclosure</h2>
          <p>We do not sell your personal information. We may share data with:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Service providers:</strong> hosting (Dokploy/Docker), database (MongoDB), analytics, and email delivery providers who process data on our behalf under strict contractual obligations</li>
            <li><strong>Authentication providers:</strong> Google, GitHub, or email-based identity verification</li>
            <li><strong>Legal requirements:</strong> when required by law, court order, or governmental request</li>
            <li><strong>Business transfers:</strong> in connection with a merger, acquisition, or sale of assets (you will be notified of any change in ownership or data practices)</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">5. Data Retention</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Account data:</strong> retained while your account is active, deleted within 30 days of account closure upon request</li>
            <li><strong>Submissions and assessments:</strong> retained for 1 year unless your organization specifies otherwise</li>
            <li><strong>Device audit data:</strong> retained for 90 days after the proctored session</li>
            <li><strong>Web Vitals metrics:</strong> retained for 90 days</li>
            <li><strong>Audit logs:</strong> retained for 1 year for security purposes</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">6. Data Security</h2>
          <p>
            We implement industry-standard security measures including encryption in transit (TLS 1.3),
            encryption at rest, access controls, and regular security audits. However, no method of
            electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Access, correct, or delete your personal data</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict processing of your data</li>
            <li>Withdraw consent at any time</li>
            <li>Lodge a complaint with a supervisory authority</li>
          </ul>
          <p>
            To exercise these rights, contact us at privacy@codespectra.ai. We will respond to requests
            within 30 days.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">8. International Transfers</h2>
          <p>
            Your data may be processed in countries other than your country of residence. We ensure
            appropriate safeguards are in place for international transfers, including standard
            contractual clauses where required.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">9. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for users under the age of 16. We do not knowingly collect
            personal information from children. If we learn that we have collected data from a child
            under 16, we will delete it promptly.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be notified
            via email or a prominent notice on the Service. Your continued use after changes are
            posted constitutes acceptance of the revised policy.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">11. Contact Us</h2>
          <p>If you have questions about this Privacy Policy, contact us at:</p>
          <p className="text-foreground">privacy@codespectra.ai</p>
        </section>
      </article>
    </PublicPageWrapper>
  )
}

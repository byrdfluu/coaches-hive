export default function PrivacyPage() {
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <p className="public-kicker">Legal</p>
        <h1 className="public-title mt-2 text-4xl md:text-5xl">Privacy Policy</h1>
        <p className="public-copy mt-4 max-w-3xl text-sm md:text-base">
          Learn how we collect, use, and protect your personal information on Coaches Hive.
        </p>
        <p className="mt-2 text-xs text-[#4a4a4a]">Last updated: March 2026</p>

        <div className="mt-8 space-y-6 text-sm text-[#4a4a4a]">

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">1. Information We Collect</h2>
            <p className="mt-3 font-medium text-[#191919]">Account and profile information</p>
            <ul className="mt-2 space-y-1">
              <li>• Name, email address, phone number, date of birth</li>
              <li>• Profile photo, sport specialties, bio, and credentials</li>
              <li>• Payment details (processed and stored by Stripe — we do not store raw card data)</li>
              <li>• Role on the platform: athlete, coach, organization admin, or guardian</li>
            </ul>
            <p className="mt-3 font-medium text-[#191919]">Guardian account data</p>
            <ul className="mt-2 space-y-1">
              <li>• If you create a guardian account via an invite link, we collect your name, email address, and password</li>
              <li>• We store the guardian–athlete relationship, a history of approvals you have made, and your linked athlete&apos;s name and ID</li>
              <li>• When an athlete under 18 provides a guardian&apos;s email address during registration, we send a single invite email to that address and store a time-limited invite token (expires in 7 days). If the invite is not accepted, no account is created and no further emails are sent to that address</li>
            </ul>
            <p className="mt-3 font-medium text-[#191919]">Organization data</p>
            <ul className="mt-2 space-y-1">
              <li>• Organization name, type, and branding (logo, colors)</li>
              <li>• Team rosters, member roles, and membership status</li>
              <li>• Compliance documents, waivers, and signatures uploaded by org admins</li>
              <li>• Subscription plan, billing history, and usage data</li>
            </ul>
            <p className="mt-3 font-medium text-[#191919]">Usage and technical data</p>
            <ul className="mt-2 space-y-1">
              <li>• Pages visited, features used, session duration, and click events</li>
              <li>• Device type, browser, operating system, and IP address</li>
              <li>• Error logs and crash reports (collected via Sentry)</li>
              <li>• Cookies and local storage used for session management and preferences</li>
            </ul>
            <p className="mt-3 font-medium text-[#191919]">Communication content</p>
            <ul className="mt-2 space-y-1">
              <li>• Messages sent through the in-app messaging system</li>
              <li>• Support tickets, replies, and attachments</li>
              <li>• Session notes and file attachments</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">2. How We Use Your Information</h2>
            <ul className="mt-3 space-y-2">
              <li>• To create and manage your account and verify your identity</li>
              <li>• To connect athletes and coaches, and to facilitate session bookings</li>
              <li>• To process payments, issue receipts, and handle refunds</li>
              <li>• To send transactional emails such as booking confirmations, reminders, and account notifications</li>
              <li>• To enable organizations to manage teams, waivers, and member compliance</li>
              <li>• To facilitate guardian consent and approval workflows for minor athletes</li>
              <li>• To send a one-time guardian invite email when a minor athlete provides a guardian&apos;s contact information during registration</li>
              <li>• To deliver in-app notifications based on your notification preferences</li>
              <li>• To investigate and resolve support tickets</li>
              <li>• To detect fraud, enforce platform policies, and maintain security</li>
              <li>• To monitor platform performance and fix errors via crash reporting</li>
              <li>• To improve our product based on aggregated, anonymized usage patterns</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">3. Sharing Your Information</h2>
            <p className="mt-3">We share personal data only in the following circumstances:</p>
            <ul className="mt-3 space-y-2">
              <li>• <span className="font-medium text-[#191919]">Coaches you book with</span> — relevant booking details and athlete profile information needed to deliver the service</li>
              <li>• <span className="font-medium text-[#191919]">Organizations you join</span> — your name, email, role, and team membership details are visible to org admins</li>
              <li>• <span className="font-medium text-[#191919]">Stripe</span> — for payment processing. Stripe&apos;s privacy policy governs their handling of payment data.</li>
              <li>• <span className="font-medium text-[#191919]">Postmark</span> — for transactional email delivery. Email addresses and name fields are shared to send system emails.</li>
              <li>• <span className="font-medium text-[#191919]">Sentry</span> — for error tracking. Error reports may incidentally include session context such as user ID or page URL.</li>
              <li>• <span className="font-medium text-[#191919]">Supabase</span> — our database and authentication provider. Data is stored in their infrastructure under our control.</li>
              <li>• <span className="font-medium text-[#191919]">Legal or safety purposes</span> — if required by law, court order, or to protect the safety of users or third parties</li>
            </ul>
            <p className="mt-3 font-medium text-[#191919]">We do not sell your personal data to any third party.</p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">4. Cookies and Tracking</h2>
            <p className="mt-3">
              We use cookies and browser local storage to maintain your login session, remember your preferences, and
              protect against cross-site request forgery. We do not use third-party advertising cookies.
            </p>
            <ul className="mt-3 space-y-2">
              <li>• <span className="font-medium text-[#191919]">Session cookies</span> — required to keep you logged in</li>
              <li>• <span className="font-medium text-[#191919]">Preference storage</span> — stores UI settings such as sidebar layout and notification preferences</li>
            </ul>
            <p className="mt-3">
              You can clear cookies at any time through your browser settings. Clearing session cookies will log you out.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">5. Data Security</h2>
            <p className="mt-3">
              We use industry-standard encryption (TLS in transit, AES-256 at rest) and role-based access controls to
              protect your information. Access to production data is limited to authorized personnel. We use row-level
              security policies in our database to ensure users can only access data they are permitted to see.
            </p>
            <p className="mt-3">
              Despite these measures, no system is 100% secure. If you suspect unauthorized access to your account,
              contact support@coacheshive.com immediately.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">6. Children&apos;s Privacy and Minor Athletes</h2>
            <p className="mt-3">
              Users under 13 may not create accounts on Coaches Hive. Users aged 13–17 may create accounts but require
              parental or guardian consent before engaging in messaging, session bookings, or transactions.
            </p>
            <p className="mt-3">
              Our guardian approval system allows parents and guardians to grant consent for specific activities on
              behalf of a minor athlete. Guardian approval actions are logged and stored. Organizations that work with
              youth athletes are responsible for obtaining and storing appropriate participation waivers and consent
              forms through the org compliance tools.
            </p>
            <p className="mt-3">
              If you believe a minor has created an account without appropriate consent, contact support@coacheshive.com
              and we will promptly investigate and remove the account if necessary.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">7. Your Rights and Data Controls</h2>
            <p className="mt-3">You have the following rights regarding your personal data:</p>
            <ul className="mt-3 space-y-2">
              <li>• <span className="font-medium text-[#191919]">Access</span> — request a copy of the personal data we hold about you</li>
              <li>• <span className="font-medium text-[#191919]">Correction</span> — update inaccurate or incomplete data from your profile settings</li>
              <li>• <span className="font-medium text-[#191919]">Deletion</span> — request deletion of your account and associated data (subject to legal retention requirements)</li>
              <li>• <span className="font-medium text-[#191919]">Export</span> — download your data in a portable format via the export center in account settings</li>
              <li>• <span className="font-medium text-[#191919]">Notification preferences</span> — control which emails and in-app notifications you receive from your settings page</li>
              <li>• <span className="font-medium text-[#191919]">Opt-out of marketing</span> — unsubscribe from any non-transactional email via the unsubscribe link in any email</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at support@coacheshive.com. We will respond within 30 days.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">8. Data Retention</h2>
            <p className="mt-3">
              We retain your account data for as long as your account is active. If you delete your account, we will
              remove your personal data within 30 days, except where retention is required by law (e.g., financial
              records, which we retain for 7 years in compliance with tax regulations).
            </p>
            <p className="mt-3">
              Waiver signatures and compliance documents uploaded by organizations may be retained per the organization&apos;s
              own legal obligations. Organizations are responsible for their own data retention policies for documents
              stored on the platform.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">9. Changes to This Policy</h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. When we make material changes, we will notify you
              by email or via an in-app notice at least 14 days before the changes take effect. Continued use of the
              platform after changes are posted means you accept the updated policy.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">10. Contact</h2>
            <p className="mt-3">
              For privacy questions, data requests, or concerns, contact us at{' '}
              <a href="mailto:support@coacheshive.com" className="font-medium text-[#b80f0a]">
                support@coacheshive.com
              </a>.
            </p>
          </section>

        </div>
      </div>
    </main>
  )
}

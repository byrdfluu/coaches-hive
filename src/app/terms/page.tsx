export default function TermsPage() {
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <p className="public-kicker">Legal</p>
        <h1 className="public-title mt-2 text-4xl md:text-5xl">Terms of Service</h1>
        <p className="public-copy mt-4 max-w-3xl text-sm md:text-base">
          These terms govern your access to and use of the Coaches Hive platform.
        </p>
        <p className="mt-2 text-xs text-[#4a4a4a]">Last updated: March 2026</p>

        <div className="mt-8 space-y-6 text-sm text-[#4a4a4a]">

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">1. Agreement</h2>
            <ul className="mt-3 space-y-2">
              <li>• By accessing or using Coaches Hive, you agree to these Terms of Service and our Privacy Policy.</li>
              <li>• If you do not agree to these Terms, do not access or use the platform.</li>
              <li>• These Terms apply to all users including athletes, coaches, organization admins, guardians, and visitors.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">2. Eligibility and Accounts</h2>
            <ul className="mt-3 space-y-2">
              <li>• You must be at least 13 years old to create an account.</li>
              <li>• Users aged 13–17 require parental or guardian consent before booking sessions, making payments, or sending messages. Our guardian approval system facilitates this consent.</li>
              <li>• Guardian accounts are separate accounts created by invitation only. When an athlete under 18 registers and provides a guardian&apos;s email address, Coaches Hive sends a one-time invite to that address. The guardian creates their own independent account and is linked to the athlete. Guardian accounts may approve or deny specific actions on behalf of the athlete, including transactions and messages. Guardians may remove their link to an athlete at any time from their guardian account settings.</li>
              <li>• You are responsible for all activity on your account. Keep your login credentials secure.</li>
              <li>• You may not create accounts for others or impersonate any person or organization.</li>
              <li>• We reserve the right to suspend or terminate accounts that violate these Terms.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">3. Coaches and Athletes</h2>
            <p className="mt-3">
              Coaches Hive is a marketplace that connects coaches and athletes. Coaches set their own pricing,
              availability, and session policies. Coaches Hive does not employ coaches and is not responsible for
              the content, quality, or safety of coaching services.
            </p>
            <ul className="mt-3 space-y-2">
              <li>• Coaches are solely responsible for the accuracy of their profiles, credentials, and session descriptions.</li>
              <li>• Athletes and guardians are responsible for evaluating coaches and determining program suitability before booking.</li>
              <li>• All bookings, session notes, and communications must occur through the platform.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">4. Bookings and Payments</h2>
            <p className="mt-3">By booking a session or purchasing a product, you agree to:</p>
            <ul className="mt-3 space-y-2">
              <li>• The coach&apos;s service description, pricing, and session rules at the time of booking.</li>
              <li>• All applicable charges, platform service fees, and taxes shown at checkout.</li>
              <li>• Payment is processed by Stripe. By completing a transaction, you also agree to Stripe&apos;s terms.</li>
            </ul>
            <p className="mt-3">
              Coaches receive payouts to their connected Stripe account after session completion, subject to the
              platform&apos;s fee schedule and payout timing.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">5. Cancellations and Refunds</h2>
            <p className="mt-3">
              Refund eligibility varies by service type, cancellation timing, and coach policy. Review our{' '}
              <a href="/refund" className="font-medium text-[#b80f0a]">Refund Policy</a> for full details.
            </p>
            <ul className="mt-3 space-y-2">
              <li>• Sessions canceled within the coach&apos;s stated cancellation window may not be refundable.</li>
              <li>• Digital marketplace products are non-refundable once delivered unless otherwise stated.</li>
              <li>• Organization membership fees are subject to each organization&apos;s own refund rules.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">6. Organization Portal</h2>
            <p className="mt-3">
              The organization portal allows schools, clubs, travel teams, and academies to manage coaches, athletes,
              and teams. Organization admins accept responsibility for:
            </p>
            <ul className="mt-3 space-y-2">
              <li>• Ensuring all invited members consent to join and are made aware of the organization&apos;s use of Coaches Hive.</li>
              <li>• Collecting, managing, and retaining required waivers, consent forms, and compliance documents for their members, particularly for minor athletes.</li>
              <li>• Maintaining accurate team rosters and member roles.</li>
              <li>• Ensuring their use of the platform complies with applicable laws including FERPA, COPPA, and state-level youth sports regulations where applicable.</li>
            </ul>
            <p className="mt-3">
              Coaches Hive provides compliance tools (waivers, document uploads, guardian consent workflows) as
              features to support organizations, but organizations remain solely responsible for their legal compliance obligations.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">7. Marketplace</h2>
            <p className="mt-3">
              Coaches may list digital products, training programs, and other offerings on the marketplace.
            </p>
            <ul className="mt-3 space-y-2">
              <li>• Coaches are solely responsible for the content, accuracy, and delivery of their products.</li>
              <li>• Coaches Hive is not a party to transactions between coaches and buyers beyond payment facilitation.</li>
              <li>• Sellers must not list items that are illegal, misleading, or violate third-party intellectual property rights.</li>
              <li>• Coaches Hive reserves the right to remove any listing that violates these Terms.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">8. Subscription Plans and Plan Limits</h2>
            <p className="mt-3">
              Access to certain features is gated by your subscription tier (athlete, coach, or organization plan).
            </p>
            <ul className="mt-3 space-y-2">
              <li>• Plans are billed on a recurring basis. You authorize us to charge your payment method at each renewal.</li>
              <li>• You may cancel your subscription at any time. Your access continues until the end of the billing period — we do not issue prorated refunds for unused time unless required by law.</li>
              <li>• If you downgrade or cancel, features unavailable on your new tier will be inaccessible. Your data is retained for 30 days after cancellation, after which it may be permanently deleted.</li>
              <li>• Organization plans include limits on the number of coaches, athletes, and teams. Exceeding these limits requires upgrading to a higher tier.</li>
              <li>• Prices may change. We will notify you at least 30 days before any price increase takes effect for active subscriptions.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">9. Waivers and Consent Forms</h2>
            <p className="mt-3">
              Organizations may require athletes or their guardians to sign digital waivers before participating in
              org activities. By signing a waiver on Coaches Hive, you acknowledge that:
            </p>
            <ul className="mt-3 space-y-2">
              <li>• Your electronic signature (name entered at the time of signing) constitutes a valid, legally binding acknowledgment of the waiver terms.</li>
              <li>• You must check an explicit agreement checkbox in addition to typing your name to confirm that your signature is intentional and legally binding.</li>
              <li>• Your signature, the date and time of signing, and your IP address are recorded and stored.</li>
              <li>• A downloadable signed record showing the waiver text, your name, the date, and your IP address is available to you at any time from your waivers page.</li>
              <li>• Waiver signatures are visible to the organization that issued the waiver.</li>
              <li>• You should retain a copy of any waiver you sign for your own records. You may request a copy from the issuing organization or from support@coacheshive.com.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">10. User Content and Conduct</h2>
            <p className="mt-3">
              You retain ownership of content you create and upload to Coaches Hive (profile content, session notes,
              messages, files). By uploading content, you grant Coaches Hive a non-exclusive license to store, display,
              and transmit that content solely to provide the service to you.
            </p>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 space-y-2">
              <li>• Harass, threaten, or discriminate against other users</li>
              <li>• Post false, misleading, or defamatory content</li>
              <li>• Attempt to gain unauthorized access to other accounts or platform systems</li>
              <li>• Use the platform to facilitate off-platform transactions to circumvent fees</li>
              <li>• Violate any applicable local, state, national, or international law</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">11. Safety and Liability</h2>
            <p className="mt-3">
              Coaching and athletic activities carry inherent physical risks. Coaches Hive is a marketplace platform
              and technology provider — we do not supervise, direct, or control coaching sessions or athletic activities.
            </p>
            <ul className="mt-3 space-y-2">
              <li>• Coaches Hive is not liable for injuries, damages, or losses arising from coaching sessions or athletic activities arranged through the platform.</li>
              <li>• Users are responsible for evaluating the suitability of coaches and programs for their needs and physical condition.</li>
              <li>• Athletes should consult a physician before beginning any new training program.</li>
              <li>• Coaches are responsible for providing safe, age-appropriate, and skill-appropriate training.</li>
            </ul>
            <p className="mt-3">
              To the maximum extent permitted by law, Coaches Hive&apos;s total liability for any claim arising from
              these Terms or your use of the platform shall not exceed the greater of (a) the total fees you paid to
              Coaches Hive in the 12 months before the claim, or (b) $100.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">12. Termination</h2>
            <p className="mt-3">
              We may suspend or terminate your account at our discretion if you violate these Terms, engage in
              fraudulent activity, or if continued access poses a risk to other users or the platform. You may delete
              your account at any time from your settings page.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">13. Contact and Updates</h2>
            <p className="mt-3">
              We may update these Terms from time to time. When we make material changes, we will notify you by
              email or via an in-app notice at least 14 days before the changes take effect. Continued use of the
              platform after the effective date means you accept the updated Terms.
            </p>
            <p className="mt-3">
              For questions about these Terms, contact us at{' '}
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

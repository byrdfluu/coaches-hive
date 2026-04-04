export default function RefundPolicyPage() {
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <p className="public-kicker">Legal</p>
        <h1 className="public-title mt-2 text-4xl md:text-5xl">Refund Policy</h1>
        <p className="public-copy mt-4 max-w-3xl text-sm md:text-base">
          Refund eligibility depends on the service type, timing, and coach or organization policies.
        </p>

        <div className="mt-8 space-y-6 text-sm text-[#4a4a4a]">
          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">1. Coaching sessions</h2>
            <ul className="mt-3 space-y-2">
              <li>• Each coach sets their cancellation window and reschedule rules.</li>
              <li>• Late cancellations or no-shows may not be eligible for a refund.</li>
              <li>• If a coach cancels, you can reschedule or request a refund.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">2. Marketplace items</h2>
            <ul className="mt-3 space-y-2">
              <li>• Digital products are generally non-refundable once delivered.</li>
              <li>• Physical items may be returned per the seller&apos;s return policy.</li>
              <li>• Damaged or incorrect items can be reported for resolution.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">3. Organization fees</h2>
            <ul className="mt-3 space-y-2">
              <li>• Org fees are set by the organization and may have specific refund rules.</li>
              <li>• Contact your organization first for fee refund requests.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">4. Disputes and chargebacks</h2>
            <p className="mt-3">
              If you believe a charge is incorrect, contact support before filing a chargeback so we can help resolve the issue.
            </p>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">5. Contact</h2>
            <p className="mt-3">For refund questions, email support@coacheshive.com.</p>
          </section>
        </div>
      </div>
    </main>
  )
}

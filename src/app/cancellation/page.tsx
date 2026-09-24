import Link from 'next/link'

export default function CancellationPage() {
  return <main className="page-shell public-page"><div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
    <p className="public-kicker">Billing</p><h1 className="public-title mt-2 text-4xl md:text-5xl">Cancel a subscription</h1>
    <p className="public-copy mt-4">You can cancel an automatically renewing Coaches Hive subscription online at any time.</p>
    <div className="mt-8 space-y-5 text-sm leading-6 text-[#4a4a4a]">
      <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">How to cancel</h2><ol className="mt-2 list-decimal space-y-2 pl-5"><li>Sign in to the account that manages the subscription.</li><li>Open Account or Organization Settings, then Billing.</li><li>Select Manage subscription and choose Cancel subscription in the secure billing portal.</li><li>Keep the cancellation confirmation for your records.</li></ol></section>
      <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">What happens next</h2><p className="mt-2">Cancellation stops the next renewal. Access continues through the current paid billing period unless the checkout offer or a signed order form says otherwise. Unused time is not prorated or refunded except where required by law.</p></section>
      <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">Need help?</h2><p className="mt-2">If you cannot access the billing controls, email <a className="text-[#b80f0a] underline" href="mailto:support@coacheshive.com?subject=Cancel%20my%20subscription">support@coacheshive.com</a> from the billing email before the renewal date. See the <Link className="text-[#b80f0a] underline" href="/refund">Refund Policy</Link> for refund eligibility.</p></section>
    </div>
  </div></main>
}

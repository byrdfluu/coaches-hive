export default function StripeConnectRefresh() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f6f4] px-6 text-center">
      <p className="text-lg font-semibold text-[#191919]">Your setup link expired.</p>
      <p className="mt-2 max-w-sm text-sm text-[#6b6b6b]">
        Return to the app and tap <strong>Set Up Stripe</strong> again to get a new link.
      </p>
    </main>
  )
}

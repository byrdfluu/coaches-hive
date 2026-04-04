export default function SafetyPage() {
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <p className="public-kicker">Safety</p>
        <h1 className="public-title mt-2 text-4xl md:text-5xl">
          Safety Guidelines &amp; Community Standards
        </h1>
        <p className="public-copy mt-4 max-w-3xl text-sm md:text-base">
          Our community guidelines to ensure a safe, respectful environment for all users.
        </p>
        <p className="mt-4 max-w-3xl text-sm text-[#4a4a4a]">
          At Coaches Hive, our mission is to create a trusted space where athletes, parents, and coaches can connect,
          grow, and succeed. To keep our community safe, positive, and professional, we ask all members to follow these guidelines:
        </p>

        <div className="mt-8 space-y-6 text-sm text-[#4a4a4a]">
          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">1. Respect &amp; Professionalism</h2>
            <ul className="mt-3 space-y-2">
              <li>• Treat others with courtesy, respect, and honesty at all times.</li>
              <li>• No harassment, hate speech, discrimination, or offensive behavior will be tolerated.</li>
              <li>• Coaches must maintain professional boundaries with all athletes and families.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">2. Safety &amp; Trust</h2>
            <ul className="mt-3 space-y-2">
              <li>• All communication and scheduling should take place within the Coaches Hive platform.</li>
              <li>• Do not share personal information (addresses, phone numbers, financial details) outside the app unless necessary for training.</li>
              <li>• Parents/guardians must be present or informed for any training sessions with minors.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">3. Authenticity &amp; Transparency</h2>
            <ul className="mt-3 space-y-2">
              <li>• Profiles must contain accurate, truthful information about experience, qualifications, and pricing.</li>
              <li>• Athletes/parents should provide honest reviews and feedback.</li>
              <li>• Misrepresentation or false claims may result in removal from the platform.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">4. Payments &amp; Transactions</h2>
            <ul className="mt-3 space-y-2">
              <li>• All payments must be processed through the Coaches Hive platform.</li>
              <li>• Off-platform transactions or “side deals” are not permitted, as they compromise safety and protections.</li>
              <li>• Refunds and cancellations are subject to platform policies.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">5. Health &amp; Wellbeing</h2>
            <ul className="mt-3 space-y-2">
              <li>• Coaches are responsible for providing safe, age-appropriate, and skill-appropriate training.</li>
              <li>• Athletes must disclose relevant health or injury information to their coach.</li>
              <li>• Emergency contacts should always be kept up-to-date in the app.</li>
            </ul>
          </section>

          <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5">
            <h2 className="text-base font-semibold text-[#191919]">6. Reporting &amp; Enforcement</h2>
            <ul className="mt-3 space-y-2">
              <li>• Members can report inappropriate behavior, safety concerns, or policy violations directly in the app.</li>
              <li>• Coaches Hive reserves the right to suspend or remove any user who violates these standards.</li>
              <li>• Serious violations may result in permanent removal and, if necessary, legal action.</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}

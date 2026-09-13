import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help & Documentation",
  description:
    "How to use this platform: accounts, characters, consent, live sessions, limitations, privacy controls, and every other answer you need.",
};

const SECTIONS: Array<{
  id: string;
  title: string;
  body: React.ReactNode;
}> = [
  {
    id: "account",
    title: "Creating an account",
    body: (
      <>
        <p>
          Sign up with a display name, email address, and password. You start
          with a welcome balance of credits (the free tier), which is what
          jobs cost. Two-factor authentication can be enabled from Settings →
          Security — we recommend it, and it is required before anyone (you
          included) is granted a staff role.
        </p>
      </>
    ),
  },
  {
    id: "character",
    title: "Creating a character",
    body: (
      <>
        <p>
          Characters live in the Characters tab. A character is a name plus
          an appearance configuration (colors, style parameters) you can
          refine over time. Once created, a character can be attached to
          jobs and live sessions, so the same look is reused consistently.
        </p>
        <p>
          If you want a character based on a real person&apos;s face or
          voice, you must have that person&apos;s consent — see the consent
          section below and the Voice &amp; Likeness Rights policy.
        </p>
      </>
    ),
  },
  {
    id: "consent",
    title: "How consent works",
    body: (
      <>
        <p>
          Face and voice media are sensitive. Before the platform will
          transform either, you grant consent per asset and per purpose
          (live session, video generation, …) in the Media &amp; Consent tab.
          Withdrawal is one click and stops new work immediately — the
          system checks consent at execution time, not just at upload.
        </p>
        <p>
          Consent records carry the policy version and timestamps of grant
          and withdrawal, and survive the deletion of the media they covered
          as accountability evidence while your account exists.
        </p>
      </>
    ),
  },
  {
    id: "live-session",
    title: "Starting a live session",
    body: (
      <>
        <p>
          In the Live Studio tab, pick a character and start a session. The
          server walks the session through a strict state machine: created →
          validated → waiting for a worker → worker assigned → loading →
          ready → live. Your camera and microphone are captured in the
          browser and sent through the media relay to the assigned worker,
          which transforms the stream and returns it.
        </p>
        <p>
          Every state you see is the real server-side state — if the worker
          goes unhealthy, the session degrades and the system attempts
          recovery automatically rather than showing you a frozen
          &quot;live&quot; indicator that means nothing.
        </p>
      </>
    ),
  },
  {
    id: "phone-to-phone",
    title: "Phone-to-phone mode (the honest social-app path)",
    body: (
      <>
        <p>
          Mobile operating systems do not allow one app to feed a virtual
          camera into another app (for good security reasons), so &quot;use
          our face in a third-party video call&quot; is not possible as an
          app feature. The honest path is physical: one phone runs this
          platform and shows your transformed self fullscreen; the second
          phone — the one in the actual call — points at that screen.
        </p>
        <p>
          Fullscreen output (below) is built for exactly this setup. It is
          low-tech, but it works with every calling app without fighting the
          operating system or breaking anyone&apos;s security model.
        </p>
      </>
    ),
  },
  {
    id: "fullscreen",
    title: "Fullscreen output",
    body: (
      <>
        <p>
          During a live session, the transformed output can be expanded
          fullscreen in the Live Studio. Fullscreen is what you share with
          the second phone in phone-to-phone mode. The control is a standard
          button — keyboard operable, announced to screen readers.
        </p>
      </>
    ),
  },
  {
    id: "web",
    title: "Using the web application",
    body: (
      <>
        <p>
          The web app is the primary surface today: Overview (live platform
          state), Characters, Media &amp; Consent, Live Studio, Jobs, and
          Settings. Everything shown is fetched from the running backend —
          the database, the worker fleet, the media relay. There are no
          simulated numbers or fake statuses anywhere in the UI.
        </p>
      </>
    ),
  },
  {
    id: "android",
    title: "Using Android",
    body: (
      <>
        <p>
          The mobile app for Android is in active development (it ships
          after the web platform stabilizes). Today, the web application
          runs on Android browsers — including camera and microphone use in
          live sessions where the browser grants those permissions. When the
          Android app is available, this section will describe installation
          and permissions in detail.
        </p>
      </>
    ),
  },
  {
    id: "ios",
    title: "Using iOS",
    body: (
      <>
        <p>
          The same status as Android: the mobile app is in development;
          today you use the web application in Safari. Camera and microphone
          work in live sessions with your permission. iPhone-to-iPhone
          physical pairing for phone-to-phone mode works exactly as
          described above.
        </p>
      </>
    ),
  },
  {
    id: "limitations",
    title: "Limitations (the honest list)",
    body: (
      <>
        <ul className="list-disc space-y-1 pl-6">
          <li>Current transformations in the dev worker are CPU color grades — real AI model faces/voices arrive through verified provider APIs and are clearly labeled when they do.</li>
          <li>Video generation (H3) requires an external provider credential; until one is configured, such jobs wait for a capable worker instead of pretending to run.</li>
          <li>GPU capacity is finite: workers sleep when idle and take time to wake (cold starts are shown as cold starts).</li>
          <li>Live media is not recorded by default; there are no recordings to manage in this build.</li>
          <li>Payments are not integrated — credits are granted manually in this phase, per the Refund Policy.</li>
        </ul>
      </>
    ),
  },
  {
    id: "platforms",
    title: "Supported platforms",
    body: (
      <>
        <p>
          Any modern desktop or mobile browser (recent Chrome, Edge, Firefox,
          Safari) on any OS. Live sessions require camera and microphone
          permissions; uploads are capped at 200 MB per file with
          MIME-sniffing validation.
        </p>
      </>
    ),
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    body: (
      <>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Job stuck QUEUED:</strong> no awake worker has the capability yet — the Jobs tab shows honest routing state (including cold starts in progress).</li>
          <li><strong>Job FAILED:</strong> your credits were automatically refunded; the failure reason is on the job record.</li>
          <li><strong>402 on submit:</strong> insufficient credits — your balance is shown in Settings → Credits.</li>
          <li><strong>Session DEGRADED:</strong> the worker went unhealthy; the system attempts recovery. If recovery fails the session ends honestly (no zombie streams).</li>
          <li><strong>Upload rejected:</strong> the declared MIME/size must match the actual file — re-check the file type and the 200 MB cap.</li>
          <li><strong>Still stuck:</strong> contact the operator (address on every legal page) — include what you clicked and what you saw.</li>
        </ul>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Privacy controls",
    body: (
      <>
        <p>
          Settings → Privacy is the control room: export all your data
          (JSON, with media links), and delete your account (password +
          typed confirmation — final and real). Consent withdrawal lives in
          Media &amp; Consent. The full data inventory — every category,
          purpose, retention window, and deletion path — is published in the{" "}
          <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>{" "}
          and generated from the platform&apos;s actual data map.
        </p>
      </>
    ),
  },
  {
    id: "deletion",
    title: "Deleting your account and data",
    body: (
      <>
        <p>
          Settings → Privacy → Delete account. Deletion removes your profile,
          characters, media (including the stored objects), sessions, jobs,
          and credit history. Abuse reports and audit entries survive
          de-linked, so decisions remain accountable — the Privacy Policy
          explains exactly what outlives the account and why. There is also
          a scheduled retention sweep that removes old media and records
          automatically (windows in the Privacy Policy).
        </p>
      </>
    ),
  },
  {
    id: "reporting",
    title: "Reporting abuse",
    body: (
      <>
        <p>
          Report any content via its context menu (ten categories) or email.
          The full process — review, decisions, enforcement — is described in
          the{" "}
          <Link href="/abuse" className="text-primary underline">Abuse &amp; Reporting</Link>{" "}
          policy.
        </p>
      </>
    ),
  },
  {
    id: "copyright-help",
    title: "Copyright complaints",
    body: (
      <>
        <p>
          See the{" "}
          <Link href="/copyright" className="text-primary underline">Copyright Policy</Link>{" "}
          for what a valid complaint contains and how it is handled.
        </p>
      </>
    ),
  },
  {
    id: "refunds-help",
    title: "Refunds",
    body: (
      <>
        <p>
          Credits for undelivered work are refunded automatically. The full
          policy — including what happens when payments are introduced — is
          the{" "}
          <Link href="/refunds" className="text-primary underline">Refund Policy</Link>.
        </p>
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/50">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8">
          <Link
            href="/"
            className="text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ← Back to the platform
          </Link>
          <h1 className="font-display mt-4 text-3xl font-bold tracking-tight">
            Help &amp; Documentation
          </h1>
          <p className="mt-3 text-muted-foreground">
            Everything you can do here, and the honest state of every feature.
          </p>
          <nav aria-label="On this page" className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="inline-flex rounded-full border px-3 py-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-10 space-y-12">
        {SECTIONS.map((s) => (
          <section key={s.id} aria-labelledby={`h-${s.id}`}>
            <h2 id={`h-${s.id}`} className="text-xl font-semibold">
              {s.title}
            </h2>
            <div className="mt-3 space-y-3 leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
              {s.body}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

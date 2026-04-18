import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
    title: "Privacy Policy — Sayzo",
    description:
        "How Sayzo collects, uses, stores, and protects your information. Local-first by design.",
};

const LAST_UPDATED = "April 15, 2026";
const CONTACT_EMAIL = "team@sayzo.app";

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-background">
            <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
                <Link
                    href="/"
                    className="flex items-center gap-2 transition-opacity hover:opacity-80"
                >
                    <Image
                        src="/sayzo-logo.png"
                        alt="Sayzo"
                        width={32}
                        height={32}
                        priority
                    />
                    <span className="text-lg font-semibold tracking-tight">
                        Sayzo
                    </span>
                </Link>
                <Link
                    href="/"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-3.5" />
                    Back to home
                </Link>
            </header>

            <article className="mx-auto w-full max-w-2xl px-6 pt-6 pb-20">
                <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Privacy Policy
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        Your voice is yours.
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Last updated: {LAST_UPDATED}
                    </p>
                </div>

                <div className="mt-8 rounded-2xl border border-border/70 bg-muted/30 p-5">
                    <h2 className="text-sm font-semibold tracking-tight">
                        The short version
                    </h2>
                    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                        <li>
                            Sayzo is a personal English coach. To coach you
                            on how you actually speak, we need to work with
                            samples of your speaking. That&apos;s the
                            trade-off this policy describes.
                        </li>
                        <li>
                            Heavy processing happens on your own device
                            first. Only the moments worth coaching on are
                            sent to Sayzo — not everything you say, and
                            never without your account signed in.
                        </li>
                        <li>
                            You can review, export, or delete any
                            conversation or drill at any time. Deletion is
                            permanent.
                        </li>
                        <li>
                            We don&apos;t sell your data. We don&apos;t use
                            it to train models for anyone else. It&apos;s
                            used to make your coaching better.
                        </li>
                    </ul>
                </div>

                <Section title="1. Who we are">
                    <p>
                        Sayzo (&quot;Sayzo,&quot; &quot;we,&quot;
                        &quot;us,&quot; or &quot;our&quot;) is based in the
                        Philippines and operates the Sayzo website, webapp,
                        and desktop companion (together, the
                        &quot;Service&quot;). This Privacy Policy explains
                        what information we collect, how we use it, who we
                        share it with, and the choices you have.
                    </p>
                    <p>
                        By using the Service, you agree to the practices
                        described here. If you don&apos;t agree, please
                        don&apos;t use the Service.
                    </p>
                </Section>

                <Section title="2. What Sayzo is, in one paragraph">
                    <p>
                        Sayzo is an English speaking coach. It is designed
                        to improve how you speak English in real
                        situations — meetings, demos, interviews, client
                        calls — by building short, personalized speaking
                        drills tailored to your patterns. To do that, Sayzo
                        works with recordings and transcripts of your
                        speaking: both the drills you complete inside the
                        app and, optionally, conversations surfaced by the
                        Sayzo desktop companion you choose to install.
                    </p>
                </Section>

                <Section title="3. Information we collect">
                    <SubSection title="Account information">
                        <p>
                            When you sign in with Google, we receive your
                            name, email address, profile image, and a
                            unique account identifier from Google. We use
                            this to create and secure your Sayzo account.
                            We never receive your Google password.
                        </p>
                    </SubSection>

                    <SubSection title="Profile and onboarding information">
                        <p>
                            During onboarding you&apos;ll answer questions
                            about your role, employer or target employer,
                            industry, goals, motivations, and what feels
                            hardest about speaking English. You&apos;ll
                            also record a short voice introduction and a
                            few speaking drills. We use these to build the
                            profile that personalizes your coaching.
                        </p>
                    </SubSection>

                    <SubSection title="Drill recordings and transcripts">
                        <p>
                            When you complete a drill in the webapp, we
                            receive the audio of your response, a
                            transcript of it, and the coaching analysis
                            our systems generate from it. This is how
                            coaching happens.
                        </p>
                    </SubSection>

                    <SubSection title="Conversations from the Sayzo desktop companion">
                        <p>
                            The Sayzo desktop companion is an optional
                            local application you install on your own Mac
                            or Windows machine. It is designed to be
                            local-first:
                        </p>
                        <ul className="mt-3 space-y-2 pl-5 [list-style:disc]">
                            <li>
                                Detection of whether you are actively
                                speaking, transcription, speaker
                                identification, and the judgment of whether
                                a given conversation is relevant to
                                coaching all run on your own device. No
                                paid cloud service sees that data at this
                                stage.
                            </li>
                            <li>
                                A conversation is only uploaded to Sayzo
                                when it passes those on-device filters
                                (i.e., it represents speaking worth
                                coaching on) and you are signed in to your
                                Sayzo account on the companion.
                            </li>
                            <li>
                                When a conversation is uploaded, it
                                includes the audio, a transcript with
                                speaker labels, and metadata like duration
                                and timestamps. Uploaded conversations
                                appear in the &quot;Captures&quot;
                                section of the webapp, where you can review
                                them, replay them, delete them, or turn
                                them into a practice drill.
                            </li>
                            <li>
                                Your voice is enrolled once during setup
                                so the companion can distinguish your
                                speech from other speakers. Coaching is
                                always focused on you — not on the other
                                people you speak with.
                            </li>
                        </ul>
                        <p className="mt-3">
                            You are in control of the companion. You can
                            pause it, quit it, or uninstall it at any
                            time. If you sign out of your Sayzo account on
                            the companion, it will stop uploading new
                            conversations.
                        </p>
                    </SubSection>

                    <SubSection title="Analysis and coaching data">
                        <p>
                            From your recordings and transcripts, Sayzo
                            produces coaching artifacts: summaries,
                            feedback, native-speaker rewrites of what you
                            said, filler-word counts, speaking-pace
                            metrics, vocabulary metrics, and voice-tone
                            readings. This coaching data is stored on your
                            account and used to plan your next drills.
                        </p>
                    </SubSection>

                    <SubSection title="Technical and usage information">
                        <p>
                            When you use the Service, we automatically
                            collect limited technical information such as
                            your device type, browser, operating system,
                            IP address (used to secure your account and
                            provide the Service), and basic usage events
                            such as when a drill was completed or a
                            session was skipped. We do not use
                            third-party advertising trackers.
                        </p>
                    </SubSection>
                </Section>

                <Section title="4. How we use your information">
                    <p>We use your information to:</p>
                    <ul className="mt-3 space-y-2 pl-5 [list-style:disc]">
                        <li>
                            Provide the Service — run your drills,
                            generate coaching, keep you signed in, and
                            connect the desktop companion to your account.
                        </li>
                        <li>
                            Personalize your coaching — build your profile
                            from what you share, identify the patterns
                            worth working on, and plan drills around them.
                        </li>
                        <li>
                            Keep the Service working — diagnose bugs,
                            prevent abuse, and monitor reliability.
                        </li>
                        <li>
                            Communicate with you about your account,
                            important updates, and security.
                        </li>
                    </ul>
                    <p className="mt-4">
                        We do not sell your personal information. We do
                        not rent it. We do not use your voice, transcripts,
                        or conversations to train machine-learning models
                        for any party other than Sayzo, and only for the
                        purpose of improving your Service experience.
                    </p>
                </Section>

                <Section title="5. Where your data goes">
                    <p>
                        Sayzo runs on a small set of vetted infrastructure
                        providers. We share your information with them
                        only as necessary to operate the Service, and only
                        under contracts that require them to protect it.
                    </p>
                    <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold">
                                        Provider
                                    </th>
                                    <th className="px-4 py-2 text-left font-semibold">
                                        Purpose
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                <tr>
                                    <td className="px-4 py-3 align-top font-medium">
                                        Google / Firebase
                                    </td>
                                    <td className="px-4 py-3 align-top text-muted-foreground">
                                        Sign-in (Google OAuth), account
                                        database (Firestore), audio storage
                                        (Cloud Storage).
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 align-top font-medium">
                                        OpenAI
                                    </td>
                                    <td className="px-4 py-3 align-top text-muted-foreground">
                                        Server-side speech-to-text of your
                                        recordings. OpenAI processes the
                                        content on our behalf under its
                                        API terms and does not use it to
                                        train its models.
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 align-top font-medium">
                                        Hume AI
                                    </td>
                                    <td className="px-4 py-3 align-top text-muted-foreground">
                                        Voice-tone and expression analysis
                                        used to give you feedback on
                                        delivery.
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 align-top font-medium">
                                        Text-to-speech provider
                                    </td>
                                    <td className="px-4 py-3 align-top text-muted-foreground">
                                        Generates spoken examples when a
                                        drill includes a native-speaker
                                        audio version.
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 align-top font-medium">
                                        Hosting &amp; analytics
                                    </td>
                                    <td className="px-4 py-3 align-top text-muted-foreground">
                                        Serves the webapp and provides
                                        basic reliability metrics.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-4">
                        We may disclose information if required by law, a
                        court order, or a lawful government request, or to
                        protect the rights, property, or safety of Sayzo,
                        our users, or the public.
                    </p>
                </Section>

                <Section title="6. Where data is stored">
                    <p>
                        Sayzo&apos;s servers and data stores are hosted on
                        Google Cloud (Firebase) in the Singapore region.
                        If you access Sayzo from another country, your
                        information will be transferred to, processed in,
                        and stored on those servers.
                    </p>
                    <p>
                        Data produced on your own device by the desktop
                        companion (local transcriptions, on-device
                        judgments, voice enrollment) stays on your device
                        unless it is part of a conversation that is
                        uploaded to Sayzo.
                    </p>
                </Section>

                <Section title="7. How long we keep it">
                    <p>
                        We keep your account data for as long as your
                        account is active. Drills, conversations, audio
                        files, and coaching artifacts are retained so you
                        can review your progress over time.
                    </p>
                    <p>
                        When you delete a drill or a conversation inside
                        the Service, we permanently delete the audio file
                        and associated transcript and analysis from our
                        systems. This action cannot be undone.
                    </p>
                    <p>
                        When you delete your account (see section 8), we
                        remove your account record and associated content
                        within 30 days, except where we are legally
                        required to retain specific records (for example,
                        for tax or fraud-prevention purposes).
                    </p>
                </Section>

                <Section title="8. Your rights and controls">
                    <p>You can, at any time:</p>
                    <ul className="mt-3 space-y-2 pl-5 [list-style:disc]">
                        <li>
                            Review and delete any individual drill or
                            conversation inside the Service.
                        </li>
                        <li>
                            Edit your profile information from the review
                            screen in the webapp.
                        </li>
                        <li>
                            Sign out on the desktop companion to stop it
                            uploading new conversations, or uninstall the
                            companion entirely.
                        </li>
                        <li>
                            Request a copy of the personal information we
                            hold about you.
                        </li>
                        <li>
                            Request that we delete your entire account and
                            all associated content.
                        </li>
                    </ul>
                    <p className="mt-4">
                        Depending on where you live, you may have
                        additional rights under data-protection laws such
                        as the GDPR (European Economic Area, United
                        Kingdom, Switzerland) or the CCPA/CPRA (California)
                        — including the right to access, correct, or
                        object to certain processing of your personal
                        information, and the right not to be discriminated
                        against for exercising those rights. To exercise
                        any of these rights, email us at{" "}
                        <a
                            className="text-foreground underline underline-offset-2"
                            href={`mailto:${CONTACT_EMAIL}`}
                        >
                            {CONTACT_EMAIL}
                        </a>
                        . We respond within 30 days.
                    </p>
                </Section>

                <Section title="9. Security">
                    <p>
                        We encrypt your data in transit (HTTPS/TLS) and at
                        rest on our storage providers. Access to
                        production systems is limited to the small number
                        of people who need it, and is audited. Sign-in is
                        delegated to Google OAuth; we never see your
                        Google password.
                    </p>
                    <p>
                        No system is perfectly secure. If we discover a
                        breach that affects your information, we&apos;ll
                        notify you in line with applicable law.
                    </p>
                </Section>

                <Section title="10. Children">
                    <p>
                        Sayzo is not directed to children under 13 (or
                        under 16 in jurisdictions where that is the
                        applicable threshold). We do not knowingly collect
                        personal information from children in those age
                        groups. If you believe a child has provided us
                        information, please contact us and we will delete
                        it.
                    </p>
                </Section>

                <Section title="11. Other speakers in your conversations">
                    <p>
                        The Sayzo desktop companion can be used in
                        conversations involving other people. Coaching is
                        focused on you, not on the other speakers. We ask
                        you to use the companion responsibly: inform the
                        people you&apos;re speaking with when doing so is
                        required in your jurisdiction, and follow your
                        employer&apos;s policies about recording work
                        conversations. You are responsible for complying
                        with the laws that apply to you.
                    </p>
                </Section>

                <Section title="12. Changes to this policy">
                    <p>
                        We may update this Privacy Policy as the Service
                        evolves. When we make a meaningful change, we will
                        update the &quot;Last updated&quot; date at the
                        top and, for larger changes, we&apos;ll tell you in
                        the app or by email before the change takes
                        effect.
                    </p>
                </Section>

                <Section title="13. Contact">
                    <p>
                        Questions, requests, or concerns? Email us at{" "}
                        <a
                            className="text-foreground underline underline-offset-2"
                            href={`mailto:${CONTACT_EMAIL}`}
                        >
                            {CONTACT_EMAIL}
                        </a>
                        .
                    </p>
                </Section>
            </article>

            <footer className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 border-t border-border/70 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
                <span>© {new Date().getFullYear()} Sayzo</span>
                <div className="flex items-center gap-5">
                    <Link
                        href="/"
                        className="transition-colors hover:text-foreground"
                    >
                        Home
                    </Link>
                    <Link
                        href="/app"
                        className="transition-colors hover:text-foreground"
                    >
                        Open app →
                    </Link>
                </div>
            </footer>
        </main>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {children}
            </div>
        </section>
    );
}

function SubSection({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="mt-5">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {title}
            </h3>
            <div className="mt-2 space-y-3">{children}</div>
        </div>
    );
}

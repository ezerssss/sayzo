"use client";

import Image from "next/image";
import {
    useEffect,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import {
    Check,
    Clock,
    Lightbulb,
    Mic,
    Minimize2,
    MousePointer2,
    PhoneOff,
    Play,
    Video,
    X,
} from "lucide-react";

/**
 * HeroDemo — a self-playing recreation of the real Sayzo loop, shown as a desktop:
 *
 *   1. call opens  → "Sayzo is capturing"   (InfoToast, corner)
 *   2. in call     → the recording pill      (StatePill, corner — live waveform)
 *   3. call ends   → "Got it / Processing…"  (InfoToast, corner)
 *   4. ready       → coaching notification    (InsightCard, corner — a cursor taps
 *                     "See full feedback")
 *   5. web app      → sayzo.app opens          (the conversation: coaching + replay)
 *
 * The HUD stays small in the corner (like the real overlay); clicking "See full
 * feedback" opens the Sayzo web app in the freed space — where the coaching lives.
 * HUD markup, palette, copy and animations are ported 1:1 from the agent repo
 * (sayzo_agent/gui/webui/src/hud/*); the web-app card reuses the real app's
 * coaching styling. accent #2563eb → blue-600, ink #1a1a1a, ink-muted #6b7280 →
 * gray-500, ink-border #e5e7eb → gray-200. A caption pill above the demo narrates
 * each step in plain words.
 *
 * It auto-plays by default. A row of dots below the demo (one per step) lets the
 * viewer jump around; tapping a dot pauses autoplay (not hover-based, so it works
 * on touch where there's no hover), then hands autoplay back after a few idle
 * seconds so one tap doesn't strand the loop. Press-and-hold the graphic itself
 * holds on a step (lift to resume): the touch-native pause. Plain hover does NOT
 * pause (deliberate — it kept yanking autoplay on desktop); only an explicit tap
 * or press stops it.
 */

const STEPS = [
    { key: "idle", ms: 1100 },
    { key: "detect", ms: 1900 },
    { key: "capturing", ms: 1900 },
    { key: "recording", ms: 2400 },
    { key: "ended", ms: 1900 },
    { key: "processing", ms: 1800 },
    { key: "notify", ms: 2000 },
    { key: "webapp", ms: 2400 },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

// After the viewer takes the wheel (taps a dot), hand autoplay back once they've
// been idle this long. ~3× a step's duration, so it reads as a deliberate pause
// and gives the wordy cards (insight / web app) room to be read, but still comes
// back so a single tap doesn't strand the loop. Press-and-hold extends it.
const RESUME_AFTER_MS = 6000;

const CAPTION: Record<StepKey, string> = {
    idle: "Sayzo waits quietly on your computer",
    detect: "You hop on a call — Sayzo asks first",
    capturing: "You're in — capturing on your computer",
    recording: "Listening as you speak",
    ended: "The call ends — Sayzo checks in",
    processing: "Saving and reviewing your call",
    notify: "Your coaching is ready",
    webapp: "See it all in the web app",
};

export function HeroDemo() {
    const reduced = usePrefersReducedMotion();
    const [i, setI] = useState(0);
    // Tapping a dot hands the viewer the wheel (not hover-based, so it sticks on
    // touch where most landing traffic is). It's not permanent though — autoplay
    // resumes after they go idle (see the resume effect below).
    const [userTouched, setUserTouched] = useState(false);
    // Bumped on every tap so the idle-resume timer restarts on each interaction,
    // even when `userTouched` is already true (a no-op setState wouldn't re-fire).
    const [tapNonce, setTapNonce] = useState(0);
    // Press-and-hold the graphic to hold on a step (the touch-native version of
    // "rest on it to read" — finger down pauses, lift resumes). Pointer-based, so
    // a click-hold does the same on desktop, but a plain hover does NOT pause.
    const [holding, setHolding] = useState(false);

    const autoplay = !reduced && !userTouched && !holding;

    useEffect(() => {
        if (!autoplay) return;
        const id = setTimeout(
            () => setI((n) => (n + 1) % STEPS.length),
            STEPS[i].ms,
        );
        return () => clearTimeout(id);
    }, [i, autoplay]);

    // Idle-resume: a while after the last tap, give autoplay back. Restarts on
    // each tap (via tapNonce). If they're press-and-holding when this fires,
    // `holding` keeps it paused until they lift — so the hold naturally extends.
    useEffect(() => {
        if (!userTouched) return;
        const id = setTimeout(() => setUserTouched(false), RESUME_AFTER_MS);
        return () => clearTimeout(id);
    }, [userTouched, tapNonce]);

    // The index actually on screen. Reduced motion holds on the payoff (web app
    // open with coaching) until the viewer steps in; after that it follows `i`.
    const active = reduced && !userTouched ? STEPS.length - 1 : i;
    const step = STEPS[active];
    const secs = step.ms / 1000;

    // Tapping a dot jumps to that step and pauses autoplay until they go idle.
    const goTo = (idx: number) => {
        setUserTouched(true);
        setTapNonce((n) => n + 1);
        setI(idx);
    };
    // The call window opens at "detect" (you jump on a call) and closes at
    // "ended" (the call wrapped up) — so the desktop starts empty, the window
    // animates in, and it animates out before the end-of-call check-in.
    const meetingOpen =
        step.key === "detect" ||
        step.key === "capturing" ||
        step.key === "recording";
    const webAppOpen = step.key === "webapp";

    return (
        <div className="mx-auto w-full max-w-3xl">
            {/* Caption — sits ABOVE the demo (clearly Sayzo's narration, not part
                of the on-screen app) and names each step in plain words. */}
            <div className="mb-4 flex justify-center">
                <span
                    key={step.key}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-[13px] font-medium text-foreground shadow-sm duration-700 animate-in fade-in-0 slide-in-from-bottom-1"
                >
                    <span className="relative flex size-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500/60 motion-safe:animate-ping" />
                        <span className="relative inline-flex size-2 rounded-full bg-blue-600" />
                    </span>
                    {CAPTION[step.key]}
                </span>
            </div>

            <div
                className="relative isolate min-h-[340px] overflow-hidden rounded-3xl border border-black/10 shadow-2xl ring-1 ring-black/5 sm:min-h-0 sm:aspect-video"
                onPointerDown={() => setHolding(true)}
                onPointerUp={() => setHolding(false)}
                onPointerLeave={() => setHolding(false)}
                onPointerCancel={() => setHolding(false)}
            >
                {/* Desktop wallpaper + menu bar */}
                <div className="absolute inset-0 bg-[radial-gradient(140%_140%_at_25%_0%,#1e3a8a_0%,#0f172a_58%)]">
                    <div className="flex h-7 items-center justify-between px-3 text-[10px] font-medium text-white/55">
                        <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-white/40" />
                            <span className="size-1.5 rounded-full bg-white/25" />
                            <span className="size-1.5 rounded-full bg-white/25" />
                        </span>
                        <span className="tabular-nums">9:41</span>
                    </div>
                </div>

                {/* Two app windows, shown in sequence: the call, then sayzo.app */}
                <Window open={meetingOpen}>
                    <MeetingWindow speaking={step.key === "recording"} />
                </Window>
                <Window open={webAppOpen}>
                    <WebApp />
                </Window>

                {/* Soft glow so the corner HUD reads as a bright overlay */}
                <div className="pointer-events-none absolute -right-8 -top-8 z-10 h-44 w-44 rounded-full bg-blue-500/20 blur-3xl" />

                {/* The HUD — always a small corner overlay, like the real thing.
                    Hidden on the web-app step (the notification was clicked). */}
                {step.key !== "webapp" && (
                    <div className="absolute right-2.5 top-9 z-20 origin-top-right scale-[0.74] sm:right-4 sm:top-11 sm:scale-[0.82]">
                        <div key={step.key}>
                            {step.key === "detect" && (
                                <Consent
                                    title="Sayzo is ready to coach you"
                                    body="Looks like you're in a Zoom call. Want us to capture this so we can highlight your coachable moments?"
                                    noLabel="Not now"
                                    yesLabel="Start coaching"
                                    secs={secs}
                                    animate={autoplay}
                                    clicking={!reduced}
                                />
                            )}
                            {step.key === "capturing" && (
                                <Toast
                                    title="Sayzo is capturing"
                                    body="Press Ctrl + Alt + L anytime to stop."
                                    secs={secs}
                                    animate={autoplay}
                                />
                            )}
                            {step.key === "recording" && <Pill />}
                            {step.key === "ended" && (
                                <Consent
                                    title="Was that the end of your meeting?"
                                    body="It's been quiet for a bit. Wrap up and save, or keep going?"
                                    noLabel="Not yet"
                                    yesLabel="Yes, done"
                                    secs={secs}
                                    animate={autoplay}
                                    clicking={!reduced}
                                />
                            )}
                            {step.key === "processing" && (
                                <Toast
                                    title="Got it"
                                    body="Processing your capture. You'll see a notification when it's ready."
                                    secs={secs}
                                    animate={autoplay}
                                />
                            )}
                            {step.key === "notify" && (
                                <Insight
                                    secs={secs}
                                    animate={autoplay}
                                    clicking={!reduced}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Step dots — one per narration step, so people can jump around
                instead of only watching. Tapping a dot hands over the wheel
                (autoplay stops, sticky so it sticks on touch too, where there's
                no hover). Dots map 1:1 to STEPS/CAPTION, so they stay in lockstep
                with the caption pill above. */}
            <div
                className="mt-5 flex items-center justify-center gap-0.5"
                role="group"
                aria-label="Demo steps"
            >
                {STEPS.map((s, idx) => {
                    const isActive = idx === active;
                    return (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => goTo(idx)}
                            aria-label={`Step ${idx + 1}: ${CAPTION[s.key]}`}
                            aria-current={isActive ? "step" : undefined}
                            className="flex h-7 items-center justify-center rounded-full px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                            <span
                                className={`rounded-full transition-all duration-300 ${
                                    isActive
                                        ? "h-2 w-5 bg-blue-600"
                                        : "size-2 bg-border hover:bg-muted-foreground/50"
                                }`}
                            />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* A floating app window that opens/closes on the desktop. */
function Window({ open, children }: { open: boolean; children: ReactNode }) {
    return (
        <div
            className={`absolute inset-x-3 bottom-4 top-8 origin-center transition-all duration-500 ease-out sm:inset-x-5 ${
                open
                    ? "scale-100 opacity-100"
                    : "pointer-events-none scale-[0.97] opacity-0"
            }`}
        >
            {children}
        </div>
    );
}

/* ----------------------------- The work call ----------------------------- */

function MeetingWindow({ speaking }: { speaking: boolean }) {
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-800/95 text-left shadow-2xl ring-1 ring-black/20">
            <div className="flex items-center gap-2 px-3.5 py-2.5">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="ml-1.5 text-[11px] font-medium text-slate-300">
                    Team standup
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] tabular-nums text-slate-400">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    00:42
                </span>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2.5 px-3.5">
                <CallTile initials="Y" name="You" speaking={speaking} />
                <CallTile initials="DR" name="Daniel R." />
            </div>
            <div className="flex items-center justify-center gap-2 py-3">
                <CallCtrl>
                    <Mic className="size-3.5" />
                </CallCtrl>
                <CallCtrl>
                    <Video className="size-3.5" />
                </CallCtrl>
                <span className="flex size-8 items-center justify-center rounded-full bg-red-500 text-white shadow-sm">
                    <PhoneOff className="size-3.5" />
                </span>
            </div>
        </div>
    );
}

function CallTile({
    initials,
    name,
    speaking = false,
}: {
    initials: string;
    name: string;
    speaking?: boolean;
}) {
    return (
        <div
            className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-slate-700/40 transition-shadow ${
                speaking ? "ring-2 ring-blue-500" : "ring-1 ring-white/5"
            }`}
        >
            <div className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-semibold text-white shadow-inner">
                {initials}
            </div>
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-200">
                {name}
            </span>
        </div>
    );
}

function CallCtrl({ children }: { children: ReactNode }) {
    return (
        <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-slate-200">
            {children}
        </span>
    );
}

/* ----------------------------- The web app ------------------------------- */
/* Reuses the real app's coaching styling (sky→indigo card, "You said:"/"Try:",
   a replay player) so it reads as the actual product opening after the call. */

function NavItem({
    title,
    meta,
    active = false,
}: {
    title: string;
    meta: string;
    active?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between gap-1 rounded-md px-1.5 py-1 text-[11px] ${
                active ? "bg-sky-50 font-medium text-sky-700" : "text-slate-600"
            }`}
        >
            <span className="truncate">{title}</span>
            <span
                className={`shrink-0 text-[9px] ${active ? "text-sky-500" : "text-slate-400"}`}
            >
                {meta}
            </span>
        </div>
    );
}

function WebApp() {
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-white text-left shadow-2xl ring-1 ring-black/10">
            {/* browser chrome */}
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                <span className="size-2.5 rounded-full bg-gray-300" />
                <span className="size-2.5 rounded-full bg-gray-300" />
                <span className="size-2.5 rounded-full bg-gray-300" />
                <div className="ml-1 hidden h-5 flex-1 items-center rounded-md bg-white px-2 text-[10px] text-gray-400 ring-1 ring-gray-200 sm:flex">
                    <span className="truncate">
                        sayzo.app/app/conversations
                    </span>
                </div>
            </div>

            {/* app shell — sidebar of recent calls + the conversation */}
            <div className="flex min-h-0 flex-1">
                {/* sidebar */}
                <div className="hidden w-36 shrink-0 flex-col gap-0.5 border-r border-gray-200 bg-gray-50/60 p-2.5 sm:flex">
                    <div className="mb-1 flex items-center gap-1.5 px-1">
                        <Image
                            src="/sayzo-logo.png"
                            alt=""
                            width={16}
                            height={16}
                            className="shrink-0"
                        />
                        <span className="text-[12px] font-semibold tracking-tight text-slate-900">
                            Sayzo
                        </span>
                    </div>
                    <p className="px-1 pb-0.5 pt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                        Recent calls
                    </p>
                    <NavItem title="Team standup" meta="now" active />
                    <NavItem title="Client demo" meta="Tue" />
                    <NavItem title="1:1 with Mara" meta="Mon" />
                    <NavItem title="Sprint review" meta="Fri" />
                </div>

                {/* conversation */}
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden p-3 sm:p-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600">
                            Your conversation
                        </p>
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                            <h4 className="text-[15px] font-semibold text-slate-900">
                                Team standup
                            </h4>
                            <span className="hidden shrink-0 text-[11px] text-slate-400 sm:block">
                                Today · 24 min
                            </span>
                        </div>
                    </div>

                    {/* coaching insight (mirrors coaching-insight-card.tsx) */}
                    <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50/50 p-3">
                        <div className="flex items-start gap-2.5">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-200/60 text-sky-700">
                                <Lightbulb className="size-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
                                    A clearer way to give your update
                                </p>
                                <p className="mt-1.5 border-l-2 border-sky-300 pl-2 text-[12px] italic leading-snug text-slate-500">
                                    <span className="font-medium not-italic text-slate-700">
                                        You said:
                                    </span>{" "}
                                    &ldquo;I think maybe we could possibly look
                                    into it?&rdquo;
                                </p>
                                <p className="mt-1.5 text-[12px] leading-snug text-slate-700">
                                    <span className="font-semibold">Try:</span>{" "}
                                    &ldquo;I recommend we look into it.&rdquo;
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* replay this moment (mirrors audio-player.tsx) */}
                    <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                            <Play className="size-3.5 translate-x-px fill-white" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-slate-700">
                                Replay this moment
                            </p>
                            <div className="mt-1.5 flex items-center gap-2">
                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
                                    <div className="h-full w-1/3 rounded-full bg-blue-600" />
                                </div>
                                <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                                    0:12
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* more moments to review */}
                    <div className="hidden items-center justify-between rounded-xl border border-dashed border-gray-200 px-3 py-2 text-[11px] text-slate-500 sm:flex">
                        <span>2 more moments to review</span>
                        <span className="font-medium text-sky-600">
                            View all →
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------ HUD elements ----------------------------- */
/* Ported from sayzo_agent/gui/webui/src/hud/* — kept visually 1:1. */

function GripDots() {
    return (
        <div
            className="flex items-center justify-center gap-[3px] pb-0.5 pt-1 opacity-45"
            aria-hidden
        >
            <span className="size-[3px] rounded-full bg-gray-500" />
            <span className="size-[3px] rounded-full bg-gray-500" />
            <span className="size-[3px] rounded-full bg-gray-500" />
        </div>
    );
}

function BrandHeader({
    size = 24,
    textClass = "text-[15px]",
}: {
    size?: number;
    textClass?: string;
}) {
    return (
        <div className="mt-1 flex items-center gap-2 border-b border-gray-200 pb-3">
            <Image
                src="/sayzo-logo.png"
                alt=""
                width={size}
                height={size}
                className="shrink-0"
            />
            <span
                className={`${textClass} font-semibold tracking-tight text-[#1a1a1a]`}
            >
                Sayzo
            </span>
        </div>
    );
}

function HudCard({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`hud-element-enter relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left text-[#1a1a1a] shadow-xl ${className}`}
        >
            <GripDots />
            {children}
        </div>
    );
}

function Pill() {
    return (
        <div className="hud-element-enter flex w-fit flex-col gap-1 rounded-2xl border border-gray-200 bg-white px-1 pb-2 pt-1 text-[#1a1a1a] shadow-lg">
            <GripDots />
            <div className="flex items-center gap-2.5 px-2">
                <Image
                    src="/sayzo-logo.png"
                    alt="Sayzo"
                    width={32}
                    height={32}
                    className="animate-sayzo-pulse shrink-0"
                />
                <Waveform />
                <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-[#1a1a1a]">
                    Done
                    <Check size={13} strokeWidth={2.5} />
                </span>
                <span className="flex size-7 items-center justify-center rounded-full text-gray-500">
                    <Minimize2 size={13} />
                </span>
            </div>
        </div>
    );
}

function Toast({
    title,
    body,
    secs,
    animate,
}: {
    title: string;
    body: string;
    secs: number;
    animate: boolean;
}) {
    return (
        <HudCard className="w-[272px] px-3 pb-3 pt-1">
            <BrandHeader />
            <div className="mt-2 flex items-start gap-3">
                <div className="mt-1 size-2 shrink-0 rounded-full bg-blue-600" />
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-tight text-[#1a1a1a]">
                        {title}
                    </div>
                    <div className="mt-0.5 text-[12px] leading-snug text-gray-500">
                        {body}
                    </div>
                </div>
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                    className="h-full bg-blue-600"
                    style={
                        animate
                            ? {
                                  animation: `hud-toast-countdown ${secs}s linear forwards`,
                              }
                            : { width: "100%" }
                    }
                />
            </div>
        </HudCard>
    );
}

/* Detection consent — Sayzo asks before it captures (start) and confirms when
   the call goes quiet (end). Ported from the agent's ConsentCard. The cursor
   taps the primary ("Yes") button. */
function Consent({
    title,
    body,
    noLabel,
    yesLabel,
    secs,
    animate,
    clicking = false,
}: {
    title: string;
    body: string;
    noLabel: string;
    yesLabel: string;
    secs: number;
    animate: boolean;
    clicking?: boolean;
}) {
    return (
        <HudCard className="w-[340px] px-4 pb-4 pt-1">
            <BrandHeader size={30} textClass="text-[16px]" />
            <div className="mt-3">
                <div className="text-sm font-semibold leading-tight text-[#1a1a1a]">
                    {title}
                </div>
                <div className="mt-1 text-[13px] leading-snug text-gray-500">
                    {body}
                </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
                <span className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center text-[13px] font-medium text-[#1a1a1a]">
                    {noLabel}
                </span>
                <span className="relative flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-center text-[13px] font-semibold text-white shadow">
                    {yesLabel}
                    {clicking && (
                        <span className="animate-sayzo-cursor pointer-events-none absolute -bottom-2 right-2 text-slate-900 drop-shadow-md">
                            <MousePointer2
                                size={15}
                                strokeWidth={1.5}
                                className="fill-white"
                            />
                        </span>
                    )}
                </span>
            </div>
            <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                    className="h-full bg-blue-600"
                    style={
                        animate
                            ? {
                                  animation: `hud-toast-countdown ${secs}s linear forwards`,
                              }
                            : { width: "100%" }
                    }
                />
            </div>
        </HudCard>
    );
}

function Insight({
    secs,
    animate,
    clicking = false,
}: {
    secs: number;
    animate: boolean;
    clicking?: boolean;
}) {
    return (
        <HudCard className="w-[340px] px-4 pb-4 pt-1">
            <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full text-gray-500">
                <X size={13} strokeWidth={2.5} />
            </span>

            <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 pr-6 text-[12px] leading-snug text-gray-500">
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-600/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-600">
                    <Clock size={10} strokeWidth={2.5} />
                    Just now
                </span>
                <span>
                    from your{" "}
                    <span className="font-semibold text-[#1a1a1a]">
                        2:30 pm Zoom call
                    </span>
                </span>
            </div>

            <div className="mt-2">
                <div className="text-sm font-semibold leading-tight text-[#1a1a1a]">
                    A clearer way to give your update
                </div>
                <div className="mt-2 border-l-2 border-gray-200 pl-2.5 text-[13px] italic leading-snug text-gray-500">
                    &ldquo;I think maybe we could possibly look into it?&rdquo;
                </div>
                <div className="mt-2 text-[13px] leading-snug text-gray-500">
                    Try stating it directly: &ldquo;I recommend we look into
                    it.&rdquo;
                </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
                <span className="whitespace-nowrap rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold text-gray-500">
                    Stop showing these
                </span>
                <span className="relative whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1.5 text-[12px] font-semibold text-white shadow">
                    See full feedback
                    {clicking && (
                        <span className="animate-sayzo-cursor pointer-events-none absolute -bottom-2 right-1 text-slate-900 drop-shadow-md">
                            <MousePointer2
                                size={15}
                                strokeWidth={1.5}
                                className="fill-white"
                            />
                        </span>
                    )}
                </span>
            </div>

            <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                    className="h-full bg-blue-600"
                    style={
                        animate
                            ? {
                                  animation: `hud-toast-countdown ${secs}s linear forwards`,
                              }
                            : { width: "100%" }
                    }
                />
            </div>
        </HudCard>
    );
}

/* Live waveform — ported from the agent's Waveform.tsx (synthetic-level path:
   a per-bar sine wobble modulated by a softly drifting level). Heights are
   computed inside the interval tick and held in state, so render stays pure. */
const BAR_COUNT = 7;

function barHeights(t: number, level: number): number[] {
    return Array.from({ length: BAR_COUNT }, (_, i) => {
        const phase = (i / BAR_COUNT) * Math.PI * 2;
        const wobble = 0.55 + 0.45 * Math.abs(Math.sin(t + phase));
        return Math.max(0.15, Math.min(1, level * wobble));
    });
}

function Waveform() {
    const [bars, setBars] = useState<number[]>(() => barHeights(0, 0.5));

    useEffect(() => {
        let tick = 0;
        let level = 0.5;
        const id = setInterval(() => {
            tick += 1;
            level = Math.max(
                0.15,
                Math.min(0.95, level + (Math.random() - 0.5) * 0.3),
            );
            setBars(barHeights(tick * 0.18, level));
        }, 90);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="flex h-6 items-center gap-[3px]" aria-hidden>
            {bars.map((h, i) => (
                <div
                    key={i}
                    className="w-[3px] rounded-full bg-blue-600"
                    style={{
                        height: `${Math.round(h * 100)}%`,
                        transition: "height 120ms ease-out",
                    }}
                />
            ))}
        </div>
    );
}

function usePrefersReducedMotion() {
    return useSyncExternalStore(
        (onStoreChange) => {
            const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
            mq.addEventListener("change", onStoreChange);
            return () => mq.removeEventListener("change", onStoreChange);
        },
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        () => false,
    );
}

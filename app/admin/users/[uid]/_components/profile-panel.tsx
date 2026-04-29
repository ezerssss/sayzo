"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserFocusInsights } from "@/types/focus-insights";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

type ProfilePanelProps = {
    profile: UserProfileType | null;
    authRecord: {
        email: string;
        disabled: boolean;
        createdAt: string;
    } | null;
    skillMemory: SkillMemoryType | null;
    focusInsights: UserFocusInsights | null;
    counts: { sessions: number; captures: number };
};

export function ProfilePanel({
    profile,
    authRecord,
    skillMemory,
    focusInsights,
    counts,
}: ProfilePanelProps) {
    return (
        <section className="rounded-xl border border-border bg-card">
            <header className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Profile</h2>
            </header>
            <div className="grid gap-4 p-4 lg:grid-cols-3">
                <KeyValueGroup
                    title="Account"
                    rows={[
                        ["Email", authRecord?.email ?? "—"],
                        [
                            "Auth created",
                            authRecord?.createdAt
                                ? new Date(authRecord.createdAt).toLocaleString()
                                : "—",
                        ],
                        [
                            "Auth status",
                            authRecord?.disabled ? "disabled" : "active",
                        ],
                        [
                            "Profile created",
                            profile?.createdAt
                                ? new Date(profile.createdAt).toLocaleString()
                                : "—",
                        ],
                        [
                            "Profile updated",
                            profile?.updatedAt
                                ? new Date(profile.updatedAt).toLocaleString()
                                : "—",
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Onboarding"
                    rows={[
                        [
                            "Complete",
                            profile?.onboardingComplete ? "yes" : "no",
                        ],
                        [
                            "Status",
                            profile?.onboardingStatus ?? "—",
                        ],
                        [
                            "Drills saved",
                            String(profile?.onboardingDrills?.length ?? 0),
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Counts"
                    rows={[
                        ["Sessions", String(counts.sessions)],
                        ["Captures", String(counts.captures)],
                        [
                            "Skill memory",
                            skillMemory ? "present" : "—",
                        ],
                        [
                            "Focus insights",
                            focusInsights ? "present" : "—",
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Work context"
                    rows={[
                        ["Role", profile?.role ?? "—"],
                        ["Industry", profile?.industry ?? "—"],
                        ["Company", profile?.companyName ?? "—"],
                        [
                            "Employment",
                            profile?.employmentStatus ?? "—",
                        ],
                        [
                            "Wants interview practice",
                            profile?.wantsInterviewPractice ? "yes" : "no",
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Goals"
                    rows={[
                        [
                            "Primary motivation",
                            profile?.motivation ?? "—",
                        ],
                        [
                            "Goals",
                            profile?.goals?.join(", ") || "—",
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Access"
                    rows={[
                        [
                            "Has full access",
                            profile?.hasFullAccess ? "yes" : "no",
                        ],
                        [
                            "Requested at",
                            profile?.accessRequestedAt
                                ? new Date(
                                      profile.accessRequestedAt,
                                  ).toLocaleString()
                                : "—",
                        ],
                        [
                            "Granted at",
                            profile?.accessGrantedAt
                                ? new Date(
                                      profile.accessGrantedAt,
                                  ).toLocaleString()
                                : "—",
                        ],
                    ]}
                />
            </div>

            {profile?.internalLearnerContext ||
            profile?.internalDrillSignalNotes ||
            profile?.internalCaptureContext ||
            profile?.internalCaptureDeliveryNotes ? (
                <CollapsibleNotes
                    profile={profile}
                    skillMemory={skillMemory}
                />
            ) : null}
        </section>
    );
}

function KeyValueGroup({
    title,
    rows,
}: {
    title: string;
    rows: Array<[string, string]>;
}) {
    return (
        <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </p>
            <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs">
                {rows.map(([k, v]) => (
                    <div
                        key={k}
                        className="flex items-baseline justify-between gap-3"
                    >
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right text-foreground">{v}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function CollapsibleNotes({
    profile,
    skillMemory,
}: {
    profile: UserProfileType;
    skillMemory: SkillMemoryType | null;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-t border-border">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/30"
            >
                <ChevronRight
                    className={cn(
                        "size-3 transition-transform",
                        open && "rotate-90",
                    )}
                />
                Internal coaching notes
            </button>
            {open ? (
                <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
                    <NoteBlock
                        title="Learner context"
                        body={profile.internalLearnerContext}
                    />
                    <NoteBlock
                        title="Drill signal notes"
                        body={profile.internalDrillSignalNotes}
                    />
                    <NoteBlock
                        title="Capture context"
                        body={profile.internalCaptureContext ?? ""}
                    />
                    <NoteBlock
                        title="Delivery notes"
                        body={profile.internalCaptureDeliveryNotes ?? ""}
                    />
                    {skillMemory ? (
                        <div className="lg:col-span-2 rounded-lg border border-border/50 bg-background/50 p-3 text-xs">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Skill memory
                            </p>
                            <p>
                                <span className="text-muted-foreground">
                                    Strengths:
                                </span>{" "}
                                {skillMemory.strengths.join(", ") || "—"}
                            </p>
                            <p>
                                <span className="text-muted-foreground">
                                    Weaknesses:
                                </span>{" "}
                                {skillMemory.weaknesses.join(", ") || "—"}
                            </p>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function NoteBlock({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-xs">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </p>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80">
                {body || "—"}
            </pre>
        </div>
    );
}

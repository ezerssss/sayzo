export type SetupWizardStep = "drill-intro";

export const SETUP_WIZARD_STEP_ORDER: SetupWizardStep[] = ["drill-intro"];

export type OnboardingSampleConfig = {
    step: SetupWizardStep;
    title: string;
    /** One short line under the title — the "why". */
    subtitle: string;
    /** A few short, scannable things to mention (not a paragraph). */
    hints: string[];
    /** Tiny helper under the timer. */
    helper: string;
    maxSeconds: number;
    sampleType: "self_introduction" | "workplace_scenario" | "challenge_moment";
};

// Onboarding is now a single optional voice sample — the intro carries the
// most signal for personalizing coaching. Kept deliberately light: a short
// "why" plus a 3-item checklist, not a wall of text. Everything else fills in
// from real conversations.
export const ONBOARDING_SAMPLES: OnboardingSampleConfig[] = [
    {
        step: "drill-intro",
        title: "Introduce yourself",
        subtitle: "A quick intro so your coaching fits you from day one.",
        hints: [
            "Your name and what you do",
            "Where you work — or the role you want",
            "What you'd like to get better at",
        ],
        helper: "Speak naturally — about a minute is plenty.",
        maxSeconds: 60,
        sampleType: "self_introduction",
    },
];

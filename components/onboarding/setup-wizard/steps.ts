export type SetupWizardStep =
    | "welcome"
    | "drill-intro"
    | "drill-workplace"
    | "drill-challenge"
    | "review";

export const SETUP_WIZARD_STEP_ORDER: SetupWizardStep[] = [
    "welcome",
    "drill-intro",
    "drill-workplace",
    "drill-challenge",
    "review",
];

export type OnboardingDrillConfig = {
    step: SetupWizardStep;
    title: string;
    prompt: string;
    helper: string;
    maxSeconds: number;
    drillType: "self_introduction" | "workplace_scenario" | "challenge_moment";
};

export const ONBOARDING_DRILLS: OnboardingDrillConfig[] = [
    {
        step: "drill-intro",
        title: "Introduce yourself",
        prompt:
            "Tell us your name, your job title, the company you work for (or the kind of role you're looking for), and why you want to improve your English right now.",
        helper:
            "Speak naturally. Mention your role and company — it helps us personalize everything.",
        maxSeconds: 60,
        drillType: "self_introduction",
    },
    {
        step: "drill-workplace",
        title: "A day at work",
        prompt:
            "Describe a recent situation where you used English at work — a meeting, a client call, a presentation, or an interview. Who were you talking to, what were you trying to communicate, and what do you wish you'd done better?",
        helper:
            "Be specific — the more detail, the better we can tailor your drills.",
        maxSeconds: 90,
        drillType: "workplace_scenario",
    },
    {
        step: "drill-challenge",
        title: "Where you want to grow",
        prompt:
            "What specific English communication skills do you most want to improve? Think about situations that feel hard — presenting, speaking up in meetings, job interviews, small talk — and tell us what you'd like to get better at and why it matters to you.",
        helper:
            "Be honest — knowing your goals and struggles is how we build the right practice plan.",
        maxSeconds: 90,
        drillType: "challenge_moment",
    },
];

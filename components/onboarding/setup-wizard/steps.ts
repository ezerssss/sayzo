export type SetupWizardStep =
    | "drill-intro"
    | "drill-workplace"
    | "drill-challenge";

export const SETUP_WIZARD_STEP_ORDER: SetupWizardStep[] = [
    "drill-intro",
    "drill-workplace",
    "drill-challenge",
];

export type OnboardingSampleConfig = {
    step: SetupWizardStep;
    title: string;
    prompt: string;
    helper: string;
    maxSeconds: number;
    sampleType: "self_introduction" | "workplace_scenario" | "challenge_moment";
};

export const ONBOARDING_SAMPLES: OnboardingSampleConfig[] = [
    {
        step: "drill-intro",
        title: "Introduce yourself",
        prompt:
            "Tell us your name, your job title, the company you work for (or the kind of role you're looking for), and why you want to improve your English right now.",
        helper:
            "Speak naturally. Mention your role and company, it helps us personalize everything.",
        maxSeconds: 60,
        sampleType: "self_introduction",
    },
    {
        step: "drill-workplace",
        title: "A day at work",
        prompt:
            "Describe a recent situation where you used English at work: a meeting, a client call, a presentation, or an interview. Who were you talking to, what were you trying to communicate, and what do you wish you'd done better?",
        helper:
            "Be specific. The more detail, the better we can tailor your coaching.",
        maxSeconds: 90,
        sampleType: "workplace_scenario",
    },
    {
        step: "drill-challenge",
        title: "Where you want to grow",
        prompt:
            "What specific English communication skills do you most want to improve? Think about situations that feel hard (presenting, speaking up in meetings, job interviews, small talk) and tell us what you'd like to get better at and why it matters to you.",
        helper:
            "Be honest. Knowing your goals and struggles is how we build the right coaching plan.",
        maxSeconds: 90,
        sampleType: "challenge_moment",
    },
];

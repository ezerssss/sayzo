export type LandingFaq = { question: string; answer: string };

/**
 * Single source of truth for the landing FAQ. Rendered visibly by
 * landing-content.tsx and emitted as FAQPage JSON-LD by app/page.tsx, so the
 * structured data and the on-page copy can never drift apart.
 */
export const LANDING_FAQ: LandingFaq[] = [
    {
        question: "Is it free?",
        answer: "Free to start. Feedback on your first conversations is on us, no credit card. When you're ready for more, request full access and keep going.",
    },
    {
        question: "How does Sayzo work?",
        answer: "Install Sayzo on your computer and it joins the work calls you choose. After each one, you get feedback on how it went, plus the moments worth practicing again.",
    },
    {
        question: "What is a replay?",
        answer: "After Sayzo analyzes a conversation, tap Replay to redo that exact moment. You record a fresh take and Sayzo coaches it against the original, so you can hear the difference.",
    },
    {
        question: "Do I need to install anything?",
        answer: "Yes. Sayzo works best on desktop, where the companion brings your real conversations into your coaching. There is no browser-only practice mode; the value comes from your actual calls.",
    },
    {
        question: "Is my audio private?",
        answer: "Sayzo only works with the conversations you choose. You can review anything before you replay it, delete any recording, and sign out to stop contributing new data.",
    },
    {
        question: "What if my English is already good?",
        answer: "Sayzo tunes to your level. It won't coach you on basics if your friction is elsewhere: in structure, pace, or the moment you need to push back on a stakeholder without sounding rude.",
    },
];

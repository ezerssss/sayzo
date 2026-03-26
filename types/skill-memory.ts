export type SkillMemoryType = {
    uid: string;

    strengths: string[];

    weaknesses: string[];
    /** Focus areas that are consistently strong and can be deprioritized. */
    masteredFocus: string[];
    /** Areas that recently regressed and should be revisited soon. */
    reinforcementFocus: string[];
    /** Session id already consumed by memory updater (idempotency guard). */
    lastProcessedSessionId: string | null;

    createdAt: string;
    updatedAt: string;
};

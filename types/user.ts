export type UserProfileType = {
    uid: string;
    onboardingComplete: boolean;

    role: string;
    industry: string;

    goals: string[];
    additionalContext: string;

    createdAt: string;
    updatedAt: string;
};

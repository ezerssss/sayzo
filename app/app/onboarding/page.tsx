"use client";

import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useUserProfileExists } from "@/hooks/use-user-profile-exists";

export default function OnboardingPage() {
    const { user } = useAuthUser();
    const { onboardingDrills } = useUserProfileExists(user?.uid);

    if (!user) return null;

    return <SetupWizard uid={user.uid} savedDrills={onboardingDrills} />;
}

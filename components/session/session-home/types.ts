export type DrillState = "idle" | "recording" | "analyzing" | "complete";

export type SessionHomeProps = {
    uid: string;
    userLabel: string;
    onSignOut: () => void;
    authError?: string | null;
    onBackToDashboard?: () => void;
};

export type PreNewDrillReflectionState = {
    priorSessionId: string;
    scenarioTitle: string;
};

export type DrillState = "idle" | "recording" | "analyzing" | "complete";

export type SessionHomeProps = {
    uid: string;
    userLabel: string;
    onSignOut: () => void;
    authError?: string | null;
};

export type PreNewDrillReflectionState = {
    priorSessionId: string;
    scenarioTitle: string;
};

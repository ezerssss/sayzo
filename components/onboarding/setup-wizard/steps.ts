export type SetupWizardStep =
    | "welcome"
    | "role"
    | "goals"
    | "pain"
    | "sample";

export const SETUP_WIZARD_STEP_ORDER: SetupWizardStep[] = [
    "welcome",
    "role",
    "goals",
    "pain",
    "sample",
];

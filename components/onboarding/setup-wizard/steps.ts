export type SetupWizardStep =
    | "welcome"
    | "role"
    | "workplace"
    | "goals"
    | "motivation"
    | "pain"
    | "sample";

export const SETUP_WIZARD_STEP_ORDER: SetupWizardStep[] = [
    "welcome",
    "role",
    "workplace",
    "goals",
    "motivation",
    "pain",
    "sample",
];

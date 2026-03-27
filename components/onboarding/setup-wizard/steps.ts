export type SetupWizardStep =
    | "welcome"
    | "role"
    | "employment"
    | "workplace"
    | "goals"
    | "motivation"
    | "pain"
    | "sample";

export const SETUP_WIZARD_STEP_ORDER: SetupWizardStep[] = [
    "welcome",
    "role",
    "employment",
    "workplace",
    "goals",
    "motivation",
    "pain",
    "sample",
];

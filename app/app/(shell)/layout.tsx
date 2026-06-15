import type { ReactNode } from "react";

import { AppFrame } from "@/components/app/app-frame";

/**
 * The persistent shell for the signed-in, onboarded app. Everything in this
 * route group (overview, conversations, replays, focus) shares the same rail +
 * content column without remounting between navigations. Onboarding and login
 * live OUTSIDE this group, so they never render the sidebar.
 */
export default function ShellLayout({
    children,
}: Readonly<{ children: ReactNode }>) {
    return <AppFrame>{children}</AppFrame>;
}

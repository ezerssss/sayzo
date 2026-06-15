import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { MobileTabBar } from "@/components/app/mobile-tab-bar";
import { CreditsBanner } from "@/components/credits/credits-banner";
import { MobileBanner } from "@/components/mobile/mobile-banner";

/**
 * The persistent master-detail shell: a quiet left rail + a single scrollable
 * content column. Lives in app/app/(shell)/layout.tsx so it persists across
 * navigations (no remount, no scroll reset, no re-subscribe). Onboarding and
 * login stay OUTSIDE the (shell) group, so they never get a sidebar.
 *
 * The frame owns the chrome the panes used to each repeat: the scroll
 * container, the max-w-4xl column + padding, the mobile banner and the credits
 * banner. Panes now render only their own content.
 */
export function AppFrame({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <div className="fixed inset-0 flex bg-background">
            <AppSidebar />
            <main className="flex min-w-0 flex-1 flex-col">
                <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <MobileBanner page="app" />
                    <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
                        <CreditsBanner />
                        {children}
                    </div>
                </div>
                <MobileTabBar />
            </main>
        </div>
    );
}

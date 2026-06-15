import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The install step on the onboarding finalize screen — the genuine next action
 * once the profile is building. Sends users to the full install page in a NEW
 * TAB (this tab is still finishing their setup, so we keep it alive). Cardless
 * and airy to match the voice-orb flow; the OS-aware download, Windows caution,
 * and step-by-step all live on /install.
 */
export function OnboardingInstall() {
    return (
        <div className="flex flex-col items-center text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                Last step
            </p>
            <h2 className="mt-1.5 text-base font-semibold tracking-tight">
                Install Sayzo on your computer
            </h2>
            <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                It joins your work calls, then your feedback and replays show up
                right here.
            </p>

            <Link
                href="/install"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: "lg" }), "mt-5 gap-2")}
            >
                See how to install
                <ArrowUpRight className="size-4" />
            </Link>
        </div>
    );
}

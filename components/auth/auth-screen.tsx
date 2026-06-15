import Image from "next/image";
import type { ReactNode } from "react";

import { AmbientBackdrop } from "@/components/app/ambient-backdrop";

/**
 * Full-bleed atmospheric backdrop shared by every auth surface — the /app
 * guard, the /login PKCE bridge, the /admin guard, and the loading states.
 * Cardless and centered, matching the onboarding flow: content sits directly on
 * the ambient backdrop, no boxy card.
 */
export function AuthScreen({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <div className="fixed inset-0 overflow-y-auto bg-background">
            <AmbientBackdrop />
            <div className="relative flex min-h-full items-center justify-center p-6">
                <div className="w-full max-w-md">{children}</div>
            </div>
        </div>
    );
}

/**
 * The brand mark on auth screens: the logo in a haloed circle that echoes the
 * onboarding voice orb (same size, same breathing glow), so signing in and
 * setting up read as one continuous flow.
 */
export function AuthLogoBadge() {
    return (
        <div className="relative flex size-24 items-center justify-center">
            <div
                aria-hidden
                className="absolute inset-2 rounded-full bg-gradient-to-br from-sky-400/30 to-indigo-500/30 blur-2xl motion-safe:animate-pulse"
            />
            <div className="relative flex size-20 items-center justify-center rounded-full bg-white shadow-xl shadow-sky-600/20 ring-1 ring-sky-100">
                <Image
                    src="/sayzo-logo.png"
                    alt="Sayzo"
                    width={40}
                    height={40}
                    priority
                    className="rounded-lg"
                />
            </div>
        </div>
    );
}

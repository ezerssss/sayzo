import type { ReactNode } from "react";

import { AppShell } from "./_components/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
    return (
        <main className="flex min-h-screen w-full items-center justify-center p-6">
            <AppShell>{children}</AppShell>
        </main>
    );
}

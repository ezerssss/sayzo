import type { ReactNode } from "react";

import { AppShell } from "./_components/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-screen w-full flex-col">
            <main className="flex flex-1 w-full items-center justify-center p-6">
                <AppShell>{children}</AppShell>
            </main>
        </div>
    );
}

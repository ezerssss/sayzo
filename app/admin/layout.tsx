import type { ReactNode } from "react";

import { AdminShell } from "./_components/admin-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-screen w-full flex-col">
            <main className="flex flex-1 w-full">
                <AdminShell>{children}</AdminShell>
            </main>
        </div>
    );
}

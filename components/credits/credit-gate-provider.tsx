"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { CreditLimitDialog } from "@/components/credits/credit-limit-dialog";
import { RequestAccessDialog } from "@/components/credits/request-access-dialog";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useUserCredits } from "@/hooks/use-user-credits";

type CreditGateState = {
    remaining: number;
    hasFullAccess: boolean;
    isExhausted: boolean;
    /** Open the limit dialog. Returns false if the user IS exhausted (so callers can early-return). */
    openLimitDialog: () => void;
    /** Open the limit dialog and return `false` when exhausted so call sites can bail. */
    guard: () => boolean;
    openRequestDialog: () => void;
    closeAll: () => void;
};

const CreditGateContext = createContext<CreditGateState | null>(null);

export function useCreditGate(): CreditGateState {
    const ctx = useContext(CreditGateContext);
    if (!ctx) {
        throw new Error(
            "useCreditGate must be used inside <CreditGateProvider>",
        );
    }
    return ctx;
}

export function CreditGateProvider({ children }: { children: ReactNode }) {
    const { user } = useAuthUser();
    const credits = useUserCredits(user?.uid);
    const [openDialog, setOpenDialog] = useState<"none" | "limit" | "request">(
        "none",
    );

    const isExhausted =
        !credits.hasFullAccess && credits.remaining <= 0 && !credits.loading;

    const openLimitDialog = useCallback(() => setOpenDialog("limit"), []);
    const openRequestDialog = useCallback(() => setOpenDialog("request"), []);
    const closeAll = useCallback(() => setOpenDialog("none"), []);

    const guard = useCallback(() => {
        if (isExhausted) {
            setOpenDialog("limit");
            return false;
        }
        return true;
    }, [isExhausted]);

    const value = useMemo<CreditGateState>(
        () => ({
            remaining: credits.remaining,
            hasFullAccess: credits.hasFullAccess,
            isExhausted,
            openLimitDialog,
            guard,
            openRequestDialog,
            closeAll,
        }),
        [
            credits.remaining,
            credits.hasFullAccess,
            isExhausted,
            openLimitDialog,
            guard,
            openRequestDialog,
            closeAll,
        ],
    );

    return (
        <CreditGateContext.Provider value={value}>
            {children}
            <CreditLimitDialog
                open={openDialog === "limit"}
                onOpenChange={(open) => !open && closeAll()}
                onRequestAccess={() => setOpenDialog("request")}
                hasRequested={Boolean(credits.requestedAt && !credits.grantedAt)}
            />
            <RequestAccessDialog
                open={openDialog === "request"}
                onOpenChange={(open) => !open && closeAll()}
                uid={user?.uid}
            />
        </CreditGateContext.Provider>
    );
}

"use client";

import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface PropsInterface {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRequestAccess: () => void;
    hasRequested: boolean;
}

export function CreditLimitDialog(props: Readonly<PropsInterface>) {
    const { open, onOpenChange, onRequestAccess, hasRequested } = props;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                {hasRequested ? (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-2 text-foreground">
                                <MailCheck className="size-5" />
                                <DialogTitle>Request received</DialogTitle>
                            </div>
                            <DialogDescription>
                                Thanks — we&apos;ve got your request and will
                                follow up by email as soon as we can unlock full
                                access for you.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="sm:justify-end">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Got it
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>You&apos;re out of Sayzo credits</DialogTitle>
                            <DialogDescription>
                                You&apos;ve used all your available actions.
                                Request full access and we&apos;ll get you
                                unlocked soon.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="sm:justify-end">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Maybe later
                            </Button>
                            <Button onClick={onRequestAccess}>
                                Request full access
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

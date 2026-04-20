"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/lib/analytics/client";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";

interface PropsInterface {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    uid: string | undefined;
}

export function RequestAccessDialog(props: Readonly<PropsInterface>) {
    const { open, onOpenChange, uid } = props;
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setNote("");
            setSubmitting(false);
            setSubmitted(false);
            setError(null);
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!uid) {
            setError("You need to be signed in to request access.");
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            await api
                .post("/api/access-requests", {
                    json: { note: note.trim() || undefined },
                    timeout: 20_000,
                })
                .json();
            track("full_access_requested", {});
            setSubmitted(true);
        } catch (err) {
            setError(
                await getKyErrorMessage(err, "Couldn't send your request."),
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                {submitted ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Request sent</DialogTitle>
                            <DialogDescription>
                                We received your request. We&apos;ll email you once
                                your Sayzo account is unlocked for full access.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="sm:justify-end">
                            <Button onClick={() => onOpenChange(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Request full access to Sayzo</DialogTitle>
                            <DialogDescription>
                                Tell us a little about how you&apos;d use Sayzo
                                day to day (optional). We&apos;ll reach out by
                                email once your account is unlocked.
                            </DialogDescription>
                        </DialogHeader>
                        <Textarea
                            placeholder="What are you hoping to practice? (optional)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            disabled={submitting}
                            rows={4}
                        />
                        {error ? (
                            <p className="text-sm text-destructive">{error}</p>
                        ) : null}
                        <DialogFooter className="sm:justify-end">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => void handleSubmit()}
                                disabled={submitting || !uid}
                            >
                                {submitting ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Send request
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

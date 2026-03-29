"use client";

import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Dialog(props: React.ComponentProps<typeof BaseDialog.Root>) {
    return <BaseDialog.Root {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof BaseDialog.Trigger>) {
    return <BaseDialog.Trigger {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof BaseDialog.Portal>) {
    return <BaseDialog.Portal {...props} />;
}

function DialogBackdrop({
    className,
    ...props
}: React.ComponentProps<typeof BaseDialog.Backdrop>) {
    return (
        <BaseDialog.Backdrop
            className={cn(
                "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]",
                "transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
                className,
            )}
            {...props}
        />
    );
}

function DialogContent({
    className,
    children,
    showCloseButton = true,
    ...props
}: React.ComponentProps<typeof BaseDialog.Popup> & {
    showCloseButton?: boolean;
}) {
    return (
        <DialogPortal>
            <DialogBackdrop />
            <BaseDialog.Viewport
                className={cn(
                    "fixed inset-0 z-50 flex items-center justify-center p-4 outline-none",
                )}
            >
                <BaseDialog.Popup
                    className={cn(
                        "relative grid max-h-[min(90vh,calc(100%-2rem))] w-full max-w-lg gap-4 overflow-y-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-lg outline-none",
                        "transition-[opacity,transform] duration-200",
                        "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
                        "data-ending-style:scale-[0.98] data-ending-style:opacity-0",
                        className,
                    )}
                    {...props}
                >
                    {children}
                    {showCloseButton ? (
                        <BaseDialog.Close
                            className={cn(
                                buttonVariants({
                                    variant: "ghost",
                                    size: "icon-sm",
                                }),
                                "absolute right-3 top-3 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            aria-label="Close"
                        >
                            <X className="size-4" />
                        </BaseDialog.Close>
                    ) : null}
                </BaseDialog.Popup>
            </BaseDialog.Viewport>
        </DialogPortal>
    );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "flex flex-col gap-2 pr-10 text-left sm:pr-12",
                className,
            )}
            {...props}
        />
    );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-start sm:gap-2",
                className,
            )}
            {...props}
        />
    );
}

function DialogTitle({
    className,
    ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
    return (
        <BaseDialog.Title
            className={cn(
                "text-lg font-semibold leading-none tracking-tight text-foreground",
                className,
            )}
            {...props}
        />
    );
}

function DialogDescription({
    className,
    ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
    return (
        <BaseDialog.Description
            className={cn("text-sm leading-relaxed text-muted-foreground", className)}
            {...props}
        />
    );
}

function DialogClose(props: React.ComponentProps<typeof BaseDialog.Close>) {
    return <BaseDialog.Close {...props} />;
}

export {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
};

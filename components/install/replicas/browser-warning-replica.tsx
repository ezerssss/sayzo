import { ClickMarker, ReplicaFrame } from "./replica-frame";

/**
 * Stylized depiction of a browser's download double-check bubble (the
 * Edge/Chrome "Make sure you trust this file" moment). Kept deliberately
 * generic so it reads as "your browser", whichever one that is.
 */
export function BrowserWarningReplica() {
    return (
        <ReplicaFrame caption="If your browser asks — choose “Keep”">
            <div className="w-full max-w-[280px]">
                <div className="rounded-lg bg-white p-3 shadow-lg shadow-black/15 ring-1 ring-[#dadce0]">
                    <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#fef7e0] text-[13px]">
                            ⚠️
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-medium text-[#202124]">
                                sayzo-setup.exe
                            </p>
                            <p className="mt-0.5 text-[10px] leading-snug text-[#5f6368]">
                                Make sure you trust sayzo-setup.exe before you
                                open it
                            </p>
                        </div>
                        <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tracking-widest text-[#5f6368]">
                            ⋯
                            <ClickMarker
                                number={1}
                                className="-top-1.5 -right-1.5"
                            />
                        </span>
                    </div>
                </div>

                <div className="mt-1.5 ml-auto w-32 rounded-lg bg-white py-1 shadow-lg shadow-black/15 ring-1 ring-[#dadce0]">
                    <span className="relative mx-1 block rounded bg-[#e8f0fe] px-2.5 py-1.5 text-[10px] font-medium text-[#1a73e8]">
                        Keep
                        <ClickMarker number={2} className="-top-1.5 -right-2" />
                    </span>
                    <span className="mx-1 block px-2.5 py-1.5 text-[10px] text-[#5f6368]">
                        Delete
                    </span>
                </div>
            </div>
        </ReplicaFrame>
    );
}

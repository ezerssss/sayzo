import { ClickMarker, ReplicaFrame } from "./replica-frame";

/**
 * Stylized depiction of the Windows "Windows protected your PC" caution
 * screen. `stage` picks which moment is shown: the first screen (click
 * "More info") or the expanded one (click "Run anyway").
 */
export function SmartScreenReplica({
    stage,
}: Readonly<{ stage: "more-info" | "run-anyway" }>) {
    return (
        <ReplicaFrame
            caption={
                stage === "more-info"
                    ? "First screen — click “More info”"
                    : "Then — click “Run anyway”"
            }
        >
            <div className="w-full max-w-[280px] rounded-md bg-[#0067b8] shadow-lg shadow-black/25">
                <div className="flex justify-end px-2.5 pt-1.5">
                    <span className="text-[11px] leading-none text-white/60">
                        ✕
                    </span>
                </div>
                <div className="px-5 pt-1 pb-5">
                    <p className="text-[15px] font-semibold tracking-tight text-white">
                        Windows protected your PC
                    </p>

                    {stage === "more-info" ? (
                        <>
                            <p className="mt-2 text-[10px] leading-relaxed text-white/85">
                                Microsoft Defender SmartScreen prevented an
                                unrecognized app from starting. Running this app
                                might put your PC at risk.
                            </p>
                            <span className="relative mt-2.5 inline-block text-[10px] font-medium text-white underline underline-offset-2">
                                More info
                                <ClickMarker
                                    number={1}
                                    className="-top-1 -right-8"
                                />
                            </span>
                            <div className="mt-5 flex justify-end">
                                <span className="rounded-sm bg-[#cccccc] px-4 py-1.5 text-[10px] font-medium text-[#1b1b1b]">
                                    Don’t run
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mt-2.5 space-y-0.5 text-[10px] leading-relaxed text-white/85">
                                <p>
                                    App:{" "}
                                    <span className="text-white">
                                        sayzo-setup.exe
                                    </span>
                                </p>
                                <p>Publisher: Unknown publisher</p>
                            </div>
                            <div className="mt-5 flex justify-end gap-2">
                                <span className="relative rounded-sm bg-[#cccccc] px-4 py-1.5 text-[10px] font-medium text-[#1b1b1b]">
                                    Run anyway
                                    <ClickMarker
                                        number={2}
                                        className="-top-2 -right-2"
                                    />
                                </span>
                                <span className="rounded-sm bg-[#cccccc]/60 px-4 py-1.5 text-[10px] font-medium text-[#1b1b1b]/70">
                                    Don’t run
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </ReplicaFrame>
    );
}

/**
 * Viewport-anchored ambiance shared by the auth screens and onboarding: a
 * single soft sky glow for a hint of accent, over a neutral dot grid so the
 * texture reads without tinting everything blue. `fixed` so it never scrolls.
 * Render it once inside a full-bleed (`fixed inset-0`) container.
 */
export function AmbientBackdrop() {
    return (
        <div aria-hidden className="pointer-events-none fixed inset-0">
            <div className="absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-sky-200/20 blur-[140px]" />
            <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(15,23,42,0.035)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_55%_45%_at_50%_38%,black,transparent)]" />
        </div>
    );
}

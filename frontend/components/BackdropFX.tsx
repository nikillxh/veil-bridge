export function BackdropFX() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-grid-faint [background-size:42px_42px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-brand-500/20 blur-[140px]" />
      <div className="absolute -right-40 top-20 h-[30rem] w-[30rem] rounded-full bg-iris-500/20 blur-[150px]" />
      <div className="absolute bottom-[-12rem] left-1/3 h-[28rem] w-[28rem] rounded-full bg-indigo-500/12 blur-[160px]" />
    </div>
  );
}

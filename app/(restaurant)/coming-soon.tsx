export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <main className="p-6 md:p-8">
      <div className="rounded-xl border border-line bg-surface p-10 text-center max-w-xl mx-auto mt-8">
        <div className="text-3xl mb-3 opacity-60">🚧</div>
        <h2 className="font-display text-lg font-semibold text-ink-strong mb-2">{title}</h2>
        <p className="text-ink-faint text-sm">{note}</p>
      </div>
    </main>
  );
}

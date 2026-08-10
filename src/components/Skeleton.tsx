export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Cargando">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

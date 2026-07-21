'use client';

import dynamic from 'next/dynamic';

const CADEditor = dynamic(() => import('@/components/cad/CADEditor').then((m) => m.CADEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center rounded-lg border border-border/40 bg-card">
      <div className="text-sm text-muted-foreground">Loading CAD Editor…</div>
    </div>
  ),
});

export default function CADPage() {
  return (
    <div className="h-full">
      <CADEditor />
    </div>
  );
}

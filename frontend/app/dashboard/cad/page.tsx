'use client';

import dynamic from 'next/dynamic';
import { usePageGuard } from '@/lib/use-page-guard'
import { Loader2 } from 'lucide-react'

const CADEditor = dynamic(() => import('@/components/cad/CADEditor').then((m) => m.CADEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center rounded-lg border border-border/40 bg-card">
      <div className="text-sm text-muted-foreground">Loading CAD editor…</div>
    </div>
  ),
});

export default function CADPage() {
  const gate = usePageGuard('user')
  if (!gate.ready) return null

  return (
    <div className="h-full">
      <h1 className="sr-only">CAD editor</h1>
      <CADEditor />
    </div>
  );
}

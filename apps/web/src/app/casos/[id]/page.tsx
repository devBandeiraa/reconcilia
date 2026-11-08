import type { Metadata } from 'next';
import { CaseDetailView } from '@/components/case/case-detail-view';

export const metadata: Metadata = { title: 'Caso' };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetailView id={id} />;
}

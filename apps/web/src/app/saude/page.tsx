import type { Metadata } from 'next';
import { HealthView } from '@/components/health/health-view';

export const metadata: Metadata = { title: 'Saúde' };

export default function HealthPage() {
  return <HealthView />;
}

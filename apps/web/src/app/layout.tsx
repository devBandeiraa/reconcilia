import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reconcilia',
  description:
    'Encontra pagamentos que não batem entre loja, gateway e ERP. A IA sugere; uma pessoa aprova.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/shared/Nav';

export const metadata: Metadata = {
  title: 'T-19 Operations Center',
  description: 'Operational Accountability System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="max-w-[1440px] mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

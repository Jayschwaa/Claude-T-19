'use client';

import Link from 'next/link';

export default function Nav() {
  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700">
      <div className="max-w-[1440px] mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="font-bold text-lg text-blue-400 hover:text-blue-300">
            UWRG T-19
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/" className="hover:text-blue-300">Priority Board</Link>
            <Link href="/opportunities" className="hover:text-blue-300">Upsells</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

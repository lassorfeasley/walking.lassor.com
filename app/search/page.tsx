import { Suspense } from 'react';
import SearchPageClient from './SearchPageClient';

function SearchPageFallback() {
  return (
    <div className="w-full min-h-screen flex items-center justify-center text-neutral-500 text-xs font-[var(--font-inconsolata)]">
      Loading search…
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPageClient />
    </Suspense>
  );
}

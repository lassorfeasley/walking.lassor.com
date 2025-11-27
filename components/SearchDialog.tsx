"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface SearchDialogProps {
  /** Optional callback to run after search completes */
  onSearch?: () => void;
}

export function SearchDialog({ onSearch }: SearchDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setOpen(false);
    onSearch?.();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Open search"
          className="justify-start text-neutral-400 text-base font-black cursor-pointer hover:text-neutral-600 transition-colors"
        >
          <i className="fas fa-search"></i>
        </button>
      </DialogTrigger>
      <DialogContent
        className="bg-transparent border-none shadow-none p-0 sm:max-w-none w-auto"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="w-[min(480px,calc(100vw-2rem))]">
          <div className="w-full px-5 py-4 bg-white outline outline-1 outline-offset-[-1px] outline-neutral-300 flex flex-col justify-center items-start gap-2">
            <div className="text-neutral-700 text-base font-light leading-tight font-[var(--font-be-vietnam-pro)]">Search</div>
            <form onSubmit={handleSubmit} className="w-full" role="search">
              <div className="w-full p-2.5 bg-white outline outline-1 outline-offset-[-1px] outline-neutral-300 inline-flex justify-start items-center gap-2.5">
                <span className="text-neutral-700 text-base font-black leading-none">
                  <i className="fas fa-search" aria-hidden="true"></i>
                </span>
                <input
                  type="search"
                  aria-label="Search panoramas"
                  autoComplete="off"
                  value={query}
                  autoFocus
                  onChange={(event) => setQuery(event.target.value)}
                  className="flex-1 min-w-0 bg-transparent border-none outline-none px-0 py-0 h-auto text-neutral-700 text-base font-light leading-tight font-[var(--font-be-vietnam-pro)] focus-visible:ring-0 focus-visible:border-0"
                />
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";

export type NavItem = { href: string; label: string; icon: string };

export function Sidebar({ items, portal, primary }: {
  items: NavItem[]; portal: string; primary?: { href: string; label: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // close the drawer on navigation
  useEffect(() => { setOpen(false); }, [pathname]);
  // lock body scroll when drawer open on mobile
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login"); router.refresh();
  }

  const nav = (
    <aside className="w-64 shrink-0 bg-ink text-white flex flex-col h-full lg:min-h-screen lg:sticky lg:top-0 lg:max-h-screen">
      <div className="px-6 py-6 border-b border-line-d flex items-center justify-between">
        <div>
          <div className="font-display font-semibold text-xl leading-none">
            myjob<span className="text-coral">hack</span>
          </div>
          <div className="text-[10px] font-extrabold uppercase tracking-[.24em] text-white/40 mt-2">{portal}</div>
        </div>
        <button className="lg:hidden text-white/60 hover:text-white text-2xl leading-none" onClick={() => setOpen(false)} aria-label="Close menu">×</button>
      </div>

      {primary && (
        <div className="px-4 pt-5">
          <Link href={primary.href} className="btn-coral w-full justify-center !h-11">
            {primary.label}
          </Link>
        </div>
      )}

      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        {items.map((it) => {
          const active = pathname === it.href;
          return (
            <Link key={it.href} href={it.href}
              className={`flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium transition
                ${active ? "bg-white/10 text-white" : "text-white/55 hover:text-white hover:bg-white/5"}`}>
              <span className={`text-base ${active ? "text-coral" : ""}`}>{it.icon}</span>
              {it.label}
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-coral" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-6 border-t border-line-d pt-4">
        <button onClick={signOut}
          className="flex w-full items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium text-white/55 hover:text-white hover:bg-white/5 transition">
          <span>⏻</span> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-ink text-white">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 font-semibold" aria-label="Open menu">
          <span className="text-xl">☰</span>
          <span className="font-display">myjob<span className="text-coral">hack</span></span>
        </button>
        <span className="text-[10px] font-extrabold uppercase tracking-[.2em] text-white/40">{portal}</span>
      </div>

      {/* Desktop: always visible. Mobile: drawer */}
      <div className="hidden lg:block">{nav}</div>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 max-w-[80vw] h-full animate-[slideIn_.2s_ease]">{nav}</div>
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

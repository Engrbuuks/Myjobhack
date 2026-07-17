"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type NavItem = { href: string; label: string; icon: string };

export function Sidebar({ items, portal, primary }: {
  items: NavItem[]; portal: string; primary?: { href: string; label: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login"); router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 bg-ink text-white flex flex-col min-h-screen sticky top-0 max-h-screen">
      <div className="px-6 py-6 border-b border-line-d">
        <div className="font-display font-semibold text-xl leading-none">
          myjob<span className="text-coral">hack</span>
        </div>
        <div className="text-[10px] font-extrabold uppercase tracking-[.24em] text-white/40 mt-2">{portal}</div>
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
}

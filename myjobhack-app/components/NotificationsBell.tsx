"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Notif = { id: string; title: string; body: string | null; link: string | null; read: boolean; created_at: string };

export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.read).length;

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("notifications")
      .select("*").eq("profile_id", user.id)
      .order("created_at", { ascending: false }).limit(15);
    setItems(data ?? []);
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      const supabase = createClient();
      const ids = items.filter((n) => !n.read).map((n) => n.id);
      await supabase.from("notifications").update({ read: true }).in("id", ids);
      setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    }
  }

  return (
    /* On mobile these sit inside the sticky top bar (which is 56px tall), so they
       are pushed below it and made smaller. On desktop there is no top bar, so
       they float in the corner as before. */
    <div className="fixed top-[68px] right-3 lg:top-5 lg:right-5 z-40 lg:z-50 flex items-center gap-2">
      <a href="/portal/account" title="Account settings"
        className="w-9 h-9 lg:w-11 lg:h-11 rounded-full bg-white border border-line shadow-sm grid place-items-center hover:border-coral transition text-base lg:text-lg">⚙</a>
      <div className="relative">
      <button onClick={toggle}
        className="relative w-9 h-9 lg:w-11 lg:h-11 rounded-full bg-white border border-line shadow-sm grid place-items-center hover:border-coral transition">
        <span className="text-base lg:text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-pill bg-coral text-white text-[11px] font-bold grid place-items-center">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 card p-2 max-h-96 overflow-y-auto shadow-xl">
          {items.length === 0 ? (
            <p className="text-sm text-muted p-4">No notifications yet.</p>
          ) : items.map((n) => (
            <button key={n.id}
              onClick={() => { setOpen(false); if (n.link) router.push(n.link); }}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-paper transition">
              <div className="text-sm font-semibold">{n.title}</div>
              {n.body && <div className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</div>}
              <div className="text-[10px] text-muted-2 mt-1">{new Date(n.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
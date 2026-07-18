import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/jobs", "/join", "/roles", "/api/public", "/robots.txt", "/sitemap.xml"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && ((isPublic && !path.startsWith("/jobs") && !path.startsWith("/roles") && !path.startsWith("/join") && !path.startsWith("/api/public")) || path === "/")) {
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    const dest: Record<string, string> = {
      job_seeker: "/portal/seeker", elite_member: "/portal/elite",
      employer: "/portal/employer", recruiter: "/portal/recruiter",
      trainer: "/portal/trainer", partner: "/portal/partner", admin: "/portal/admin"
    };
    return NextResponse.redirect(
      new URL(dest[profile?.role ?? "job_seeker"] ?? "/portal/seeker", request.url)
    );
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"]
};

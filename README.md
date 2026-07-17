# MYJOBHACK App — Layer 1 Foundation

Next.js 14 (App Router) + Supabase. Seven role portals, full engine schema, RLS, auth.

## Setup

### 1. Supabase
1. Create a new project at supabase.com → note the URL, anon key, service-role key
2. SQL Editor → paste & run `supabase/migrations/0001_foundation.sql`
3. Authentication → Providers → Email: ON. (Confirm email ON recommended)
4. Authentication → URL Configuration → Site URL: `https://app.myjobhack.co`
   Redirect URLs: `https://app.myjobhack.co/auth/callback`, `http://localhost:3000/auth/callback`

### 2. Local / deploy
```bash
cp .env.example .env.local   # fill values
npm install
npm run dev                  # or push to GitHub → Vercel auto-deploys
```
Vercel: add the three env vars in Project Settings → Environment Variables.
Domain: point `app.myjobhack.co` at Vercel (CNAME), Cloudflare SSL mode "Full".

### 3. Make yourself admin
Sign up in the app (arrives as job_seeker), then in Supabase SQL Editor:
```sql
update profiles set role='admin' where email='you@myjobhack.co';
```
Sign out / in → you land on /portal/admin.

### 4. Bank details (manual payments)
```sql
update app_settings set value='{"bank":"Wema Bank","account_name":"Myjobhack","account_number":"XXXXXXXXXX"}'::jsonb where key='bank_transfer_ngn';
```

## What Layer 1 contains
- Migration 0001: full engine schema — talent CRM (4 axes), credentials/verification,
  organizations, jobs + custom form builder, applications (rules + AI fit score fields),
  trainings + invite engine + LMS (courses/modules/lessons/progress/certificates),
  plans/subscriptions/payments (Paystack/Flutterwave/manual NGN/USD), AI run log,
  Elite chapters/memberships, notifications, activity log, storage buckets + policies, seeds
- Auth: signup (job_seeker default), login, email confirmation, middleware role-routing
- Seven portal shells in the dashboard DNA (ink sidebar / paper canvas / Fraunces numerals)
- Admin dashboard with live counts + pending-action queues

## Layers ahead
L2 talent intake wizard · L3 admin CRM + one-button invites (Resend) ·
L4 subscriptions + payments + 3 Gemini tools · L5 jobs engine + auto-shortlist ·
L6 trainings + LMS UI · L7 Elite · L8 employer self-serve

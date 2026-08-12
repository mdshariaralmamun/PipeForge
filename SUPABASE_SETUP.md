# Supabase setup for PipeForge (accounts, cloud projects, shared catalog)

PipeForge works without this (local-only mode). To enable accounts:

## 1. Create the project (5 minutes)

1. supabase.com → New project (free tier is fine). Note the database password.
2. Project → **Settings → API**: copy the **Project URL** and the **anon public key**.

## 2. Configure the app

Local dev: copy `.env.example` to `.env.local` and fill in the two values.
VPS: set the same two variables as environment variables for the web container
(however your deploy passes env — do not commit real keys to git).

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 3. Create the tables

Supabase dashboard → **SQL Editor** → paste the whole of `supabase/schema.sql`
from this repo → Run. It creates `profiles`, `projects`, `catalog_items` with
row-level-security policies, plus the signup trigger and the `is_admin()` helper.

## 4. Make yourself admin

In the SQL editor (with your registered email):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## 5. Recommended auth setting

Authentication → Providers → Email: for a small team tool, turn **Confirm email**
OFF so new users can sign in immediately (otherwise they must confirm by email
first — your call).

## What users get

- Guests: the full designer, local save/load (unchanged).
- Registered users: + cloud projects in their account, + submit parts/catalogs
  to the shared system catalog (pending your approval).
- Admin (you): + approve/reject catalog submissions, + see all users' projects,
  + the shared catalog is read-only ("sealed") for everyone else.

# Tracker: setup

A simple task app: add tasks for a day with priority and start/end time, move them to any day, track status, and see simple stats. An administrator can pick any user in **Analytics** and see their tasks and numbers (read-only).

## Database (Supabase SQL Editor)
1. `supabase/manual/A-simplify-add-todos.sql`: creates the `todos` table, copies your current tasks, lets the admin read all users. Safe to re-run. Check the result table at the bottom: `todos_now` equals `expected_from_old_tables`, and your admin email shows `admin`.
2. Deploy / open the app and confirm your tasks look right.
3. `supabase/manual/B-cleanup-remove-old-tables.sql`: **deletes** the old tables (events, timers, goals, reminders, AI, settings...) to free space. Run only after step 2.

## Supabase Authentication settings (fixes reset links pointing to localhost)
Dashboard → Authentication → URL Configuration:
- **Site URL:** `https://task-manager-pmf.vercel.app`
- **Redirect URLs:** add `https://task-manager-pmf.vercel.app/auth/confirm` (and `http://localhost:3000/auth/confirm` if you also run it locally).

Email templates are optional. The app accepts both the default Supabase links and custom ones. If you prefer custom templates, use `supabase/templates/confirmation.html` and `recovery.html`.

## Vercel environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL=https://task-manager-pmf.vercel.app`, optional `APP_TIMEZONE` (default `Asia/Kolkata`). Redeploy after changing them. You no longer need any AI or service-role variables.

## Speed
Set Vercel's **Function Region** (Project Settings → Functions) to the region closest to your Supabase project (Supabase Dashboard → Project Settings → General shows it). A mismatch adds noticeable delay to every page.

## Roles
`mustakimkhan1111176@gmail.com` becomes `admin` automatically once its email is confirmed. Everyone else is `user`. Roles are stored in `public.user_roles`, never read from the browser.

# Maintenance Management System
1. Supabase: create project -> SQL Editor -> run `supabase/schema.sql` (creates tables, RLS, workflow functions, realtime, first admin).
2. Then run `supabase/upgrade.sql` (evidence storage, spares, PM). Authentication > Providers > Email: keep enabled; turn OFF "Confirm email".
3. Copy Project URL + anon key (Settings > API) into env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Netlify/Vercel site settings, or `.env` locally).
4. Deploy: push to Git and import in Netlify/Vercel (build `npm run build`, output `dist`). Config files included.
5. Login: `admin` / `Admin@12345` -> change password in Users. Add machines, then create Production/Maintenance users.

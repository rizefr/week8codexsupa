# Free Online Deployment

This app is set up for:

- Netlify for the public website
- Supabase for login and persistent cloud data

The app still works without Supabase, but data is then saved only in the current browser.

## 1. Create Supabase

1. Create a free Supabase project.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Go to Authentication > URL Configuration.
5. Set the Site URL to your final Netlify URL after deployment.
6. Add the same Netlify URL to Redirect URLs.

## 2. Get Supabase Public Keys

In Supabase project settings, copy:

- Project URL
- Anon/public key

These are public client values. Row Level Security in `supabase/schema.sql` protects your rows.

## 3. Deploy With Netlify

Recommended:

1. Put this project in a GitHub repo.
2. In Netlify, create a new site from that repo.
3. Use build command `npm run build`.
4. Use publish directory `dist`.
5. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Deploy.

Netlify will give you a free public URL like `https://something.netlify.app`.

## 4. Use On Your Phone

1. Open the Netlify URL on your phone.
2. Go to Settings.
3. Enter your email under Cloud Sync.
4. Tap the magic link from your email.
5. Logs will save to Supabase for that signed-in email.

## 5. Local Commands

```bash
npm install
npm run build
npm run dev
```

To test cloud locally:

```bash
SUPABASE_URL="https://your-project.supabase.co" SUPABASE_ANON_KEY="your-anon-key" npm run build
npm run preview
```

## Notes

- If Supabase is not configured, the app falls back to IndexedDB/localStorage.
- If you sign in after logging locally, local and cloud logs are merged by ID.
- The anon/public key is safe to expose only because RLS policies restrict each user to their own rows.

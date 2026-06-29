# Licita Lumina

Private bid, empenho, and balance control system for Almeida Lumina Ltda.

## Production Stack

- Next.js App Router
- Vercel hosting
- Supabase Postgres shared data backend
- Private cookie-based dashboard login

## Required Environment Variables

Keep real secrets only in `.env.local` and Vercel environment variables. Never commit service-role keys.

```env
AUTH_USERNAME=admin
AUTH_PASSWORD=change-this-password
AUTH_SECRET=change-this-long-random-secret
NEXT_PUBLIC_DATA_BACKEND=supabase
SUPABASE_URL=https://kjaoqfkzsearkjcqvstb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

## Supabase Setup

Run the schema in `supabase/schema.sql` against the linked Supabase project.

The app talks to Supabase from `src/app/api/data/route.ts` using `SUPABASE_SERVICE_ROLE_KEY`. The browser never receives that key.

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Verification

Before deploying:

```bash
npm run build
```

Focused lint checks are useful while touching files:

```bash
npx eslint src/app/api src/lib
```

## Deployment

Production deploy is handled with Vercel:

```bash
npx vercel deploy --prod --yes
```

After deploy, make sure the custom domains point to the newest deployment:

- `www.luminalicita.com.br`
- `luminalicita.com.br`

## Security Notes

- Rotate the Supabase service-role key if it is ever pasted into chat, screenshots, docs, or committed files.
- Keep Row Level Security enabled in Supabase. The app currently uses a private server API as the trusted backend.
- Change `AUTH_PASSWORD` before giving the tool to anyone else.
- For a future paid product, replace the single shared login with per-user accounts, roles, audit logs, and tenant separation.

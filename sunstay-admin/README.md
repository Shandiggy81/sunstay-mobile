# Sunstay Admin

Internal staff app for managing Sunstay venue data. Separate from the public mobile app (`sunstay-mobile`). Runs on **port 5174**.

## Setup

```bash
cd sunstay-admin
cp .env.example .env.local
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (same project as the mobile app)
npm install
npm run dev
```

Open http://localhost:5174 and sign in with a Supabase Auth user (`signInWithPassword`).

Venue CRUD is not included yet — this scaffold is auth-gated only.

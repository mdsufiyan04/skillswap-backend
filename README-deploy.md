Deployment — skillswap-backend

1) Install dependencies on the server

```bash
cd skillswap-backend
npm install
```

2) Prepare production env

Copy the example and edit values (do NOT commit secrets):

```bash
cp .env.production.example .env.production
# edit .env.production and set JWT_SECRET, DATABASE_URL, FRONTEND_URL, etc.
```

3) Start the app

For Render or any hosted Node service, use this start command so Prisma Client is generated and the Supabase schema is synced before Express starts. It retries transient Supabase failures before giving up:

```bash
npm start
```

4) Install PM2 (recommended) and start the app on a VPS

```bash
npm install -g pm2
npm run build
npm run db:sync
npx pm2 start ecosystem.config.js --env production
npx pm2 save
```

Follow PM2's printed `pm2 startup` command to register on system boot.

5) Logs & status

```bash
pm2 status
pm2 logs skillswap-backend --lines 200
```

6) Frontend deployment

Build and deploy the frontend with `VITE_API_URL` set to your backend API root, for example:

```bash
VITE_API_URL=https://your-backend.onrender.com/api
```

If this value is missing in production, login will show a configuration error instead of silently calling `/api` on the frontend host and producing a misleading 502.

7) Supabase / Prisma connection notes

Use Supabase's pooled connection string for `DATABASE_URL`, and keep the query params from `.env.production.example`:

```bash
connection_limit=1&pool_timeout=20
```

The app is configured for one Node process in PM2 to avoid exhausting the Supabase connection pool.

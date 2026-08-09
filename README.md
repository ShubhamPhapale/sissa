# ChessMaster

ChessMaster is a live, two-player chess web app built with Next.js, TypeScript, Tailwind CSS, and PostgreSQL.

## What it includes

- Live games with server-tracked clocks and increments
- Draw offers, resignations, rematches, and spectating
- Move history, recent games, and game browsing
- PostgreSQL-backed persistence for users, games, and moves

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env.local
```

3. Set `DATABASE_URL` to a reachable PostgreSQL database.

4. Start the app:

```bash
npm run dev
```

## Validation

- `npm run typecheck`
- `npm run build`

## Hosting

This project is ready for a standard Next.js hosting provider such as Vercel, Railway, or Fly.io.

Make sure the deployment environment provides `DATABASE_URL` and runs the database migrations before first use.

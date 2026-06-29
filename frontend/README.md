# CodeSpectra

Next.js app for learning, code scanning, interviews, and dashboards—with Supabase for auth and data.

## Requirements

- Node.js 20+
- npm (or pnpm / yarn)
- [Supabase](https://supabase.com) project **or** [Supabase CLI](https://supabase.com/docs/guides/cli) for local development

## Setup

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` from your Supabase project (**Settings → API**). For local Supabase, run `supabase start` and use the URLs and keys the CLI prints.

4. Apply database migrations (see `supabase/migrations/`) using the Supabase dashboard SQL editor or `supabase db push`.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run start   # run production server locally
npm run lint    # ESLint
```

## Learn more

- [Next.js documentation](https://nextjs.org/docs)
- [Supabase documentation](https://supabase.com/docs)

## License

Private / all rights reserved unless otherwise noted in the repository.


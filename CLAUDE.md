# CLAUDE

@AGENTS.md

## What Battlecadia is

An interactive decision engine that beats choice paralysis with head-to-head bracket
battles. Instead of scrolling lists, reviews, and star ratings, the user picks winners
in rapid 1v1 matchups until a single champion is crowned. Works across categories —
movies, books, food, products, etc. See `README.md` for the full vision and the
shopping-flow walkthrough.

Core loop (shopping example):

1. User gives a natural-language prompt (e.g. "men's shoes, size 10.5, under $500").
2. AI searches and returns ~10 candidate items to compete.
3. "Arenas" are generated dynamically from the prompt's filters — no fixed filter UI.
4. User enters an arena; items battle 1v1. Two formats: **winner-stays** and **knockout**.
5. Picking an item eliminates the loser until one champion remains.
6. User can bail early and jump straight to buy; on the buy screen they pick a vendor.

## Stack

- **Next.js 16.2.11** (App Router) + **React 19.2.4** + **TypeScript 5** + **Tailwind v4**.
- Source lives in `app/` (App Router). Path alias `@/*` maps to repo root.
- **Backend: Supabase** (see the pinned skills in `.agents/skills/` and `skills-lock.json`).
  Nothing is wired up yet — DB schema, auth, and data access are still to be built.
- `app/page.tsx` and `app/layout.tsx` are still mostly the create-next-app scaffold.
  Treat them as placeholders to replace when we start building.

## Conventions & guardrails

- **Next.js 16 has breaking changes vs. training data** (see `AGENTS.md`). Read the
  relevant guide in `node_modules/next/dist/docs/` before writing framework code.
- When touching Supabase, follow the `supabase` skill — especially RLS on every table
  in exposed schemas, and never expose the `service_role` key to the client.
- **Secrets go in `.env.local`** (already gitignored). Never commit keys or hardcode
  them. Anything the browser needs must be prefixed `NEXT_PUBLIC_` — and only
  publishable/anon-safe values may carry that prefix.

## Agent skills

Skills live in `.agents/skills/` and are pinned in `skills-lock.json`. Add more with
`npx skills add <owner>/<repo>` (e.g. `Shopify/shopify-ai-toolkit`, `supabase/agent-skills`).

**Windows requirement:** some skills (notably the Shopify ones) ship deeply nested
type-definition files that exceed Windows' 260-char path limit and make `git checkout`
fail with "Filename too long". Before adding or cloning them, enable long paths once:

```bash
git config --global core.longpaths true
```

Those heavy `assets/types/` trees are gitignored (see `.gitignore`), so they are not
committed — re-fetch any skill with `npx skills add` if you need them locally. The
per-machine `.claude/skills/` symlinks are gitignored too.

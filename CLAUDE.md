# Ditto Research

Dual-interface research tool (web UI + CLI) for Ditto's synthetic persona API (300K+ AI personas, 92% real-focus-group overlap).

## Stack

- **Web**: Next.js 14, React 18, TypeScript 5.5 (strict), Tailwind CSS 3.4 (dark theme)
- **CLI**: Python 3, stdlib only (`urllib`, no external deps)
- **API**: Next.js route handlers proxy to `https://app.askditto.io` (keeps auth server-side)
- **Env**: `DITTO_API_KEY` in `.env.local` — `rk_free_*` prefix = free tier, `rk_live_*` = paid

## Architecture

```
app/
  page.tsx          # Main UI (client component, React hooks for state)
  layout.tsx        # Root layout, dark theme (bg-gray-950)
  globals.css       # Tailwind directives only
  api/
    ask/route.ts    # Submit question (free: /v1/free/questions, paid: create study + ask)
    poll/route.ts   # Poll async job results (15s interval, 50s initial delay, 4min timeout)
    recruit/route.ts# Pre-recruit filtered personas for paid tier
cli/
  ditto_ask.py      # Standalone CLI: recruit → ask → poll → markdown report in output/
.agents/skills/     # Installed Claude skill: ditto-product-research
```

## Key workflows

**Free tier**: question → POST ask → poll single job → display results
**Paid tier**: recruit personas (with demographic filters) → select subset → create study → ask question(s) → poll jobs → fetch study answers → share link

Questions MUST be asked sequentially (poll one to completion before asking next).

## Ditto API gotchas

- Research groups use `uuid` (string), not `id` (numeric)
- Studies nest: `response["study"]["id"]`
- Gender filter: `is_female: true/false` (boolean, not string)
- State filter: 2-letter codes (`"MI"` not `"Michigan"`)
- First poll delay: 45-50s, then 15-20s intervals

## Conventions

- Tailwind for all styling, no CSS modules
- No state management library — React hooks only
- API errors shown as red banner in UI; `sys.exit(1)` in CLI
- CLI outputs markdown reports to `output/` (gitignored)
- No ESLint or Prettier configured
- Commit messages: imperative mood, brief subject line

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
python3 cli/ditto_ask.py "question" --size 10 --age-min 25 --gender female --state TX
```

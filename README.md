# 🌙 LazyGig — Your Overnight Gig Scout

**Built for DEV Hacktoberfest 2026 · Week 3: "Slow and Steady"** — build with open-weight models / open-source AI that *rewards laziness*.

LazyGig watches freelance gig boards while you sleep. An open-weight LLM scores every listing for genuine skill match and rate fairness, drafts a tailored application for each real match, and hands you a morning brief. You just tap **Approve** on the drafts you like. Demo-safe: approving marks a draft approved — nothing is ever sent automatically.

## How it works

1. **Ingest** — `POST /api/scan` pulls live listings from [Superteam Earn](https://superteam.fun) (authenticated agent endpoint) and the public [pact0](https://pact0.com) job board.
2. **Rank** — one batched call to the open-weight **Llama 3.1 8B** (`@cf/meta/llama-3.1-8b-instruct-fp8`) on Cloudflare Workers AI scores each gig 0–100 with a one-line "why it fits" and a rate check (`in-range` / `low` / `unpaid`). It's brutally honest: $0.05 microtasks and off-profile work score low.
3. **Draft** — a second batched LLM call writes a short, concrete, flattery-free application per top match.
4. **Decide** — the dashboard shows ranked cards with score bars, drafts, and Approve / Skip buttons. Decisions persist in Cloudflare KV.

## Stack

- **Cloudflare Workers** (free tier) — API + static UI in one worker
- **Workers AI** — `@cf/meta/llama-3.1-8b-instruct-fp8` (open-weight)
- **Cloudflare KV** — durable approve/skip decisions
- Zero build-time secrets: the Superteam key is set as a Worker secret at deploy, never in code

## Run it

```bash
npm install
npm run build
python3 deploy.py   # needs the custom.cloudflare credential + Superteam key file
```

Live: https://lazygig.odemakindeezekiel5.workers.dev

## API

| Method | Route | What it does |
|---|---|---|
| `GET` | `/` | Dashboard UI |
| `GET` | `/api/health` | Binding/key status |
| `POST` | `/api/scan` | Ingest → rank → draft (15-min cache) |
| `POST` | `/api/decision` | `{gigId, decision: "approved"\|"skipped"}` |

## License

MIT

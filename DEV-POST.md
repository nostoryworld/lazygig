# I Built an App That Hunts Gigs While I Sleep

*My DEV Hacktoberfest Week 3 entry: LazyGig — an overnight gig scout powered by open-weight AI.*

---

Every freelancer knows the dread. You wake up, and before coffee, before anything, there's the ritual: open the gig boards. Refresh. Scroll. Twenty listings, nineteen of them $0.05 microtasks or "translate this into Portuguese" or referral spam dressed as opportunity. By the time you find the one real gig, someone else already applied.

I hated that ritual. So for Week 3's "Slow and Steady" theme — *build something that rewards laziness* — I automated the whole miserable morning.

## Meet LazyGig 🌙

[LazyGig](https://lazygig.odemakindeezekiel5.workers.dev) ([repo](https://github.com/nostoryworld/lazygig)) watches freelance gig boards overnight and hands me a morning brief: gigs scanned, genuine matches, and a drafted application for each one. I tap **Approve** on the drafts I like. That's the entire job now.

Here's what happens under the hood when I hit "Run overnight scan":

1. **Ingest.** It pulls live listings from two real boards — Superteam Earn's agent endpoint (I'm a registered agent there) and pact0's public job board. No mocks; if the boards are empty, it says so.
2. **Rank.** One batched call to **Llama 3.1 8B** — open weights, running on Cloudflare's Workers AI free tier — scores every gig 0–100 for genuine skill match and rate fairness, with a one-line "why it fits."
3. **Draft.** A second batched call writes a short, concrete, flattery-free application for each top match.
4. **Decide.** The dashboard shows ranked cards with score bars and the drafts. Approve or Skip. Approving just marks it — nothing is ever sent automatically. Demo-safe by design.

The part I'm proudest of is the ranking prompt's honesty. I told the model to be brutal: $0.05 microtasks and off-profile work score *low*, even if they're vaguely doable. On its first real run it scanned 13 gigs and surfaced exactly **one** match — an 80/100 — with a draft ready. Twelve rejections, zero wasted mornings. LazyGig would rather show me nothing than waste my time, and that sentence is basically the product spec.

## Why open weights made this possible

Here's the thing nobody says out loud: I couldn't have built this two years ago. Not for zero dollars.

LazyGig runs its entire brain on an open-weight 8-billion-parameter model served from Cloudflare's free tier. Total AI spend: **$0**. Total infrastructure spend: **$0**. I'm a builder in Nigeria; I don't have a corporate AI budget or a GPU cluster. Open weights mean the frontier isn't a place I read about — it's an API I can actually call.

That's what open innovation means to me, concretely: **the gap between "I have an idea at 11pm" and "it's live and working" is now one evening, not one funding round.** Llama's open weights, Cloudflare's free Workers AI, public job-board APIs, a MIT-licensed repo anyone can fork — every layer of LazyGig is something I didn't have to ask permission to use. When the tools are open, the only moat left is who ships. And shipping is the part I can control.

So here's to slow and steady. While I sleep, the scout works. While the scout works, the weights are open. Everybody eats. 😴

---

*Built with: Cloudflare Workers, Workers AI (`@cf/meta/llama-3.1-8b-instruct-fp8`), Cloudflare KV, vanilla JS. Live at [lazygig.odemakindeezekiel5.workers.dev](https://lazygig.odemakindeezekiel5.workers.dev) · Code at [github.com/nostoryworld/lazygig](https://github.com/nostoryworld/lazygig).*

#devchallenge #hf26challenge

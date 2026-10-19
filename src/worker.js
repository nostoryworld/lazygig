import UI from "./ui.html";

const PROFILE = "Web3 builder in the Base ecosystem. Strong: TypeScript, Solidity, Python, AI agents, x402 payment tooling, smart-contract auditing, Cloudflare Workers. NOT his lane: translation, data entry, design, marketing copy, referral spam. Prefers real paid work over microtasks.";
const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8"; // open-weight, Workers AI free tier

let cache = null;      // { at: ms, result } — per-isolate scan cache
let memDecisions = {}; // fallback when KV binding is absent
const CACHE_MS = 15 * 60 * 1000;
const MIN_SCAN_MS = 30 * 1000;
let lastScanAt = 0;

async function getDecisions(env) {
  try {
    if (env.LAZYGIG_KV) {
      const raw = await env.LAZYGIG_KV.get("decisions");
      return raw ? JSON.parse(raw) : {};
    }
  } catch (e) {}
  return memDecisions;
}

async function setDecisionKV(env, gigId, decision) {
  memDecisions[gigId] = decision;
  try {
    if (env.LAZYGIG_KV) {
      const cur = await getDecisions(env);
      cur[gigId] = decision;
      await env.LAZYGIG_KV.put("decisions", JSON.stringify(cur));
    }
  } catch (e) {}
}

async function fetchPact0() {
  const r = await fetch("https://pact0.com/api/jobs", {
    headers: { "User-Agent": "LazyGig/1.0 (+dev-challenge)" },
    cf: { cacheTtl: 300 },
  });
  if (!r.ok) throw new Error("pact0 HTTP " + r.status);
  const d = await r.json();
  return (d?.data?.jobs || [])
    .filter((j) => j.status === "open")
    .map((j) => ({
      id: "pact0:" + j.id,
      board: "pact0",
      title: j.title || "Untitled gig",
      description: String(j.description || "").slice(0, 1200),
      amount: j.amount_usd != null ? "$" + j.amount_usd : "unpaid",
      category: j.category || "",
      url: "https://pact0.com",
      deadline: j.deadline_at || null,
    }));
}

async function fetchSuperteam(env) {
  if (!env.SUPERTEAM_API_KEY) return { error: "no-key" };
  const r = await fetch("https://superteam.fun/api/agents/listings/live?take=50", {
    headers: {
      Authorization: "Bearer " + env.SUPERTEAM_API_KEY,
      "User-Agent": "LazyGig/1.0 (+dev-challenge)",
    },
  });
  if (!r.ok) throw new Error("superteam HTTP " + r.status);
  const d = await r.json();
  const list = Array.isArray(d) ? d : [];
  return list
    .filter((l) => l.agentAccess === "AGENT_ALLOWED" || l.agentAccess === "AGENT_ONLY")
    .map((l) => ({
      id: "st:" + (l.id || l.slug),
      board: "Superteam Earn",
      title: l.title || "Untitled listing",
      description: String(l.description || l.summary || "").slice(0, 1200),
      amount: l.rewardAmount ? (l.rewardAmount + " " + (l.token || "")).trim() : "see listing",
      category: l.type || "",
      url: l.slug ? "https://superteam.fun/earn/" + l.slug : "https://superteam.fun",
      deadline: l.deadline || null,
    }));
}

async function aiJson(env, prompt, maxTokens) {
  const out = await env.AI.run(AI_MODEL, {
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens || 2500,
  });
  const text = out.response || "";
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("AI returned no JSON");
  return JSON.parse(m[0]);
}

async function rankGigs(env, gigs) {
  const list = gigs
    .map(
      (g, i) =>
        `${i + 1}. id=${g.id} | board=${g.board} | pay=${g.amount} | cat=${g.category || "?"} | TITLE: ${g.title}\n   DESC: ${g.description.slice(0, 450)}`
    )
    .join("\n\n");
  const prompt =
    "You are LazyGig, a gig-matching assistant for a freelance web3 builder.\n" +
    "Builder profile: " + PROFILE + "\n\n" +
    "Score each gig 0-100 for GENUINE skill match and rate fairness. Be brutally honest: " +
    "$0.05 microtasks, referral/recruiting gigs, and off-profile work (translation, data entry) score LOW even if vaguely doable. " +
    "Real paid work matching his stack scores HIGH.\n" +
    'Reply with ONLY a JSON array, no other text: [{"id":"<id>","score":<0-100>,"why":"<one short line>","rate":"in-range|low|unpaid"}]\n\n' +
    "GIGS:\n" + list;
  return aiJson(env, prompt, 2500);
}

async function draftApps(env, gigs) {
  const list = gigs
    .map(
      (g) =>
        `id=${g.id}\nTITLE: ${g.title}\nPAY: ${g.amount}\nDESC: ${g.description.slice(0, 600)}`
    )
    .join("\n\n---\n\n");
  const prompt =
    "Write a short freelance application for EACH gig below, in the voice of this builder " +
    "(first person, 3-4 sentences, concrete about the relevant skills, zero flattery, no emojis).\n" +
    "Builder: " + PROFILE + "\n" +
    'Reply with ONLY a JSON array, no other text: [{"id":"<id>","draft":"<application text>"}]\n\n' +
    "GIGS:\n" + list;
  return aiJson(env, prompt, 2500);
}

async function doScan(env) {
  const [pact0, st] = await Promise.allSettled([fetchPact0(), fetchSuperteam(env)]);
  const p = pact0.status === "fulfilled" && !pact0.value.error ? pact0.value : [];
  const s = st.status === "fulfilled" && !st.value.error ? st.value : [];
  const gigs = [...p, ...s];
  const boards = {
    pact0: pact0.status === "fulfilled" && !pact0.value.error ? p.length + " open" : "unreachable",
    "superteam-earn":
      st.status === "fulfilled"
        ? st.value.error === "no-key"
          ? "no key configured"
          : s.length + " agent-eligible"
        : "unreachable",
  };
  const base = { ranAt: new Date().toISOString(), scanned: gigs.length, matches: [], boards };
  if (!gigs.length) return { ...base, note: "No open gigs on the boards right now." };

  let ranked;
  try {
    ranked = await rankGigs(env, gigs);
  } catch (e) {
    return { ...base, note: "Ranking AI unavailable right now: " + String(e).slice(0, 120) };
  }
  const decisions = await getDecisions(env);
  const byId = Object.fromEntries(gigs.map((g) => [g.id, g]));
  const matches = ranked
    .filter((r) => r && typeof r.score === "number" && r.score >= 45 && byId[r.id])
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((r) => ({
      ...byId[r.id],
      score: Math.round(r.score),
      why: String(r.why || "").slice(0, 160),
      rate: ["in-range", "low", "unpaid"].includes(r.rate) ? r.rate : "low",
      decision: decisions[r.id] || null,
      draft: null,
    }));

  const top = matches.slice(0, 4);
  if (top.length) {
    try {
      const drafts = await draftApps(env, top);
      const dById = Object.fromEntries(
        (Array.isArray(drafts) ? drafts : []).map((d) => [d.id, d.draft])
      );
      matches.forEach((m) => {
        if (dById[m.id]) m.draft = String(dById[m.id]).slice(0, 1200);
      });
    } catch (e) {
      // drafts are a bonus; ranking still stands
    }
  }
  return { ...base, matches };
}

const JSONH = { "Content-Type": "application/json" };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(UI, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        ai: !!env.AI,
        superteamKey: !!env.SUPERTEAM_API_KEY,
        cached: !!cache,
      }, { headers: JSONH });
    }
    if (url.pathname === "/api/scan" && req.method === "POST") {
      const now = Date.now();
      if (cache && now - cache.at < CACHE_MS) {
        return Response.json({ ...cache.result, cached: true }, { headers: JSONH });
      }
      if (now - lastScanAt < MIN_SCAN_MS) {
        return Response.json(
          { error: "Easy — the scout just ran. Give it a minute." }, 
          { status: 429, headers: JSONH }
        );
      }
      lastScanAt = now;
      try {
        const result = await doScan(env);
        cache = { at: now, result };
        return Response.json({ ...result, cached: false }, { headers: JSONH });
      } catch (e) {
        return Response.json({ error: String(e).slice(0, 200) }, { status: 500, headers: JSONH });
      }
    }
    if (url.pathname === "/api/decision" && req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch (e) {}
      const { gigId, decision } = body;
      if (!gigId || !["approved", "skipped"].includes(decision)) {
        return Response.json({ error: "bad request" }, { status: 400, headers: JSONH });
      }
      await setDecisionKV(env, gigId, decision);
      if (cache) {
        const m = cache.result.matches.find((x) => x.id === gigId);
        if (m) m.decision = decision;
      }
      await setDecisionKV(env, gigId, decision);
      return Response.json({ ok: true }, { headers: JSONH });
    }
    return new Response("not found", { status: 404 });
  },
};

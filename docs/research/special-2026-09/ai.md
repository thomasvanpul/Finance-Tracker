# Numeris AI insights: provider options (2026-09-30)

Research only. Nothing in the repo or vault was edited or committed.

## TL;DR

- **The failure is not mainly "load". It is Groq's free-tier token budget.** The free plan gives gpt-oss-120b **8K tokens/min and 200K tokens/day** (console.groq.com/docs/rate-limits). One insight call is about 3.5K input tokens plus up to 1,024 output tokens. So **one user opening dashboard, investments, goals and budget in the same minute can use up the whole org's per-minute budget alone**, and about 40–55 insights a day use up the daily budget for everyone. Cerebras (lane 2) returns 402 on every chat call. That was measured 2026-09-18 (`cerebras.ts:31-36`). So a 429 from Groq has nowhere to go.
- **Pilot (6–20 testers): Groq Developer plan** (add a card; same models, same code, same key) **plus Claude Haiku 4.5 as a real second lane.** Estimate: about **$6/mo Groq + about $40/mo Haiku at worst case**, where worst case means Haiku serves everything. In practice Haiku serves only fallthrough, so a few dollars. Fix 429 handling at the same time (see §5).
- **Later (hundreds to thousands of users): the same two vendors**, plus server-side insight caching keyed on a data version. This is the biggest cost lever, bigger than choosing a vendor. Estimate at 1,000 active users: about **$270/mo on Groq** (upper bound, output at the cap). Budget for Haiku serving about 10% of traffic.
- **Do not:** use DeepSeek (stores data in the PRC and trains on API inputs by default), serve from the old MacBook (single stream, home exposure, sleep), or rely on in-browser models (no iPhone-grade path for a 3.5K-token prompt; Chrome's Prompt API is desktop-only).
- **Superseded vault decision:** `Efforts/Numeris-Decisions.md:574-576` says "Remove the [Cerebras] key and the three strings; **add no paid provider**." That was decided before Thomas said he can pay. If he adopts this report, record the reversal there.

---

## 1. What the code does today (measured from the repo)

### Provider chain

| Item | Value | Source |
| --- | --- | --- |
| Order, every task | `["groq", "cerebras"]`, primary `groq`, deliberately no third lane | `artifacts/api-server/src/lib/ai-providers/chain.ts:54-55`, header `:12-25` |
| Groq chat model | `openai/gpt-oss-120b` (env `GROQ_CHAT_MODEL`) | `lib/ai-providers/groq.ts:32-34` |
| Groq categorise | `openai/gpt-oss-20b` | `groq.ts:36-38` |
| Groq vision | `qwen/qwen3.8-27b` | `groq.ts:40-42` |
| Cerebras chat | `gpt-oss-120b`. **402 payment_required on POST /chat/completions** (GET /models returns 200, so boot verification cannot see it) | `lib/ai-providers/cerebras.ts:31-36, 47-49`; `docs/DATA-INVENTORY.md:222` |
| Cerebras vision | `gemma-4-31b`, retired 2026-09-18, left dead on purpose | `cerebras.ts:19-29` |
| Free-model refusal | `:free` suffix and `openrouter/free` refused in the transport | `lib/ai-providers/model-policy.ts:29-44` |
| Removed lanes | Gemini (key never authenticated, removed 2026-08-23); OpenRouter free (removed 2026-09-11, terms forbid financial data) | `chain.ts:20-25`; `docs/DATA-INVENTORY.md:211-262` |

### Where 429 and 402 are handled

They are not handled specifically. Every non-2xx response becomes a generic `throw new Error(\`HTTP ${status}: …\`)` (`lib/ai-providers/openai-compat.ts:210` for streaming, `:364` for non-streaming). Consequences:
- **Groq sends a `retry-after` header in seconds** (rate-limits doc). The code ignores it.
- There is no retry and no backoff inside a lane. The chain moves straight to Cerebras, which returns 402, so the chain is exhausted.
- A 429 counts as a breaker failure. Three consecutive failures open the breaker for 60 s, and the cooldown doubles up to 30 min (`lib/provider-health.ts:88-102, 242-244`). A short burst of 429s can therefore lock Groq out for everyone for minutes after the rate window has already reset. With Cerebras dead, the whole feature is down for that time.
- Per-call timeout is 12 s (`openai-compat.ts:50`).
- Client-facing text when every lane fails: `"The AI service is temporarily unavailable. Please try again in a moment."` (`routes/ai.ts:72`). The dashboard also pre-checks `/api/ai/status` and shows "AI insights are unavailable: no AI provider is answering right now." (`finance-tracker/src/pages/dashboard.tsx:~933-941`).
- Per-user limiter: 30 AI requests/min, keyed on userId (`api-server/src/app.ts:137-150`).

### Prompt size per insight (estimate from the actual template)

Every insight goes through `/api/ai/chat` (SSE) using `oneShotInsight` (`finance-tracker/src/lib/ai-chat-client.ts:115`).

| Part | Size | Source |
| --- | --- | --- |
| System prompt `SYSTEM_PROMPT` | 2,488 chars ≈ **620 tokens** | `routes/ai.ts:113-~140` (measured with awk/wc) |
| Portfolio context | capped at `MAX_CONTEXT_CHARS = 10_000` ≈ **up to 2,500 tokens** (typical is below the cap and was not measured) | `lib/ai-context.ts:74-77, 133-140` |
| Insight prompt | dashboard ≈ 1,500 chars ≈ **375 tokens**; markets TLDR about 60 tokens; briefing schema about 250 tokens | `dashboard.tsx:~958`, `investments/markets-tab.tsx:602-605`, `briefing.tsx:~70-96` |
| **Input per insight** | **≈ 3,500 tokens (upper-typical)** | sum |
| `max_tokens` | **1,024** for chat/insights (`routes/ai.ts:220`); 4,096 batch categorise (`:560`); 512 receipt-scan (`:447`); 1,024 receipt-split (`:353`); default 1,024 (`openai-compat.ts:155,304`) | |
| Output actually used | 3 lines on the dashboard ≈ 150–250 visible tokens. gpt-oss-* is a reasoning model, and its reasoning tokens count as output, so real output sits somewhere between about 400 and the 1,024 cap. **Not measured.** | |

**Costing basis below:** 3,500 input / 1,024 output tokens (upper bound, output at the cap). Where it matters, a "typical" column uses 3,500 / 400.

### Calls per session

| Surface | Trigger | Cache | Source |
| --- | --- | --- | --- |
| Dashboard insights | auto on mount (+ `/api/ai/status` pre-check) | sessionStorage, 30 min | `dashboard.tsx:826-850, 987-989` |
| Investments commentary | auto on mount | sessionStorage, 30 min | `investments.tsx:810, 862-881` |
| Goals insights | auto on mount, plus a refresh button | sessionStorage, no TTL | `goals.tsx:851-922` |
| Budget insights | auto on mount, plus refresh | sessionStorage, no TTL | `budget.tsx:479-530` |
| Briefing | on generate | localStorage | `briefing.tsx:53-61, 426` |
| Markets headline TLDR | one per click | in-memory | `investments/markets-tab.tsx:1476, 602` |
| AI coach chat | per message, multi-turn | none | `pages/ai-coach.tsx`, `components/ai-agent.tsx` |

**A session that visits the four main pages makes 4 insight calls in quick succession. With a briefing and a few chat turns, a session makes about 6–10.** The cache is per browser tab (sessionStorage), so a new tab, the phone app and the desktop each pay again. Nothing is cached server-side.

Assumption used below: **8 LLM calls per active user per day.**

### Vault

`Efforts/Numeris-Decisions.md:574-576`: *"Cerebras: the key returns 402, three UI strings still name it as a live fallback, and its terms make it an independent controller with no DPA. **Remove the key and the three strings; add no paid provider.**"*

`hot.md:89` (30 Sep): "Open: AI insights fail under load (Groq 429 free tier, Cerebras 402), a money call in the bank."

---

## 2. Comparison

Cost per 1,000 insights = 3.5M input tokens × input price + 1.024M output tokens × output price. Prices are USD per 1M tokens, fetched 2026-09-30.

| Option | Model | $ in / out per 1M | **$/1,000 insights (cap)** | $/1k typical (400 out) | Latency (TTFT / speed) | Rate limits | Trains on data? Retention |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **a. Groq Developer** | gpt-oss-120b | 0.15 / 0.60 | **$1.14** | $0.77 | about 5.0 s to first answer token (includes reasoning), 472 tok/s [AA] | Free: 30 RPM, 1K RPD, **8K TPM, 200K TPD**. Developer: 1K RPM / **250K TPM** per secondary sources; the official page did not render the Dev numbers | No. Up to 30 days for abuse monitoring, self-serve ZDR switch, DPA in Services Agreement, US (per `DATA-INVENTORY.md:241-243`, researched 2026-09-11) |
| a′. Groq Developer | gpt-oss-20b | 0.075 / 0.30 | $0.57 | $0.38 | 1,000 tok/s (Groq) | as above | as above |
| **b. Cerebras Developer** | gpt-oss-120b | 0.35 / 0.75 (secondary sources; **official pricing page did not render prices**) | $1.99 | $1.53 | about 1.6 s, 1,759 tok/s [AA], the fastest | Free: 5 RPM, 30K uncached TPM, 1M/day. Developer (PAYG, about $10 start): **1K RPM, 1M uncached TPM, no daily cap** (official rate-limits page) | No training. **Not a processor for personal-capacity accounts: its Inference Terms make Cerebras an independent controller** (`DATA-INVENTORY.md:244`). This is the blocker, not price |
| c. Gemini paid | 2.5 Flash-Lite | 0.10 / 0.40 | $0.76 | $0.51 | 0.32 s, 276 tok/s [AA] | not fetched | Paid tier: "Content **not** used to improve our products". Paid is required for UK/EEA users. Retention not fetched |
| c. Gemini paid | 3.5 Flash-Lite | 0.30 / 2.50 | $3.61 | $2.05 | not fetched | not fetched | as above |
| c. Gemini paid | 3.8 Flash | 0.75 / 3.75 (**doubles 1 Jan 2027** to 1.50 / 7.50) | $6.47 → $12.93 | $4.13 → $8.25 | not fetched | not fetched | as above |
| c. OpenAI | gpt-5-nano | 0.05 / 0.40 | $0.59 | $0.34 | not fetched | not fetched | Policy page not fetched (openai.com/api/pricing returned 403). **Do not rely on it until read** |
| c. OpenAI | gpt-4o-mini | 0.15 / 0.60 | $1.14 | $0.77 | not fetched | not fetched | as above |
| c. DeepSeek | deepseek-flash | 0.30 / 1.20 peak (off-peak half) | $2.28 (peak) | $1.53 | not fetched | concurrency 2,500 | **Stored in the PRC; trains on API inputs by default (opt-out); retention "as long as necessary".** Disqualified for financial data |
| c. Mistral | Small 4 (26.03) | **could not fetch prices**: mistral.ai/pricing shows plans, not API rates | — | — | — | — | not fetched |
| **c. Anthropic** | Haiku 4.5 (`claude-haiku-4-5-20251001`) | 1.00 / 5.00; cache read 0.10; batch 0.50 / 2.50 | **$8.62** | $5.50 | 0.62 s TTFT, 83 tok/s [AA] | tiered (Start/Build/Scale); numbers not fetched | "By default, we will not use your inputs or outputs from our commercial products (… Anthropic API …) to train our models." Retention window not stated on the fetched page |
| c. OpenRouter | router | provider list price, **+5.5% fee on credit purchases** (Standard), no per-token markup | provider + 5.5% | | adds a hop | per provider | ZDR routing "available on every plan"; provider-side retention can be disabled per account/request. A router is not a processor you can name in PRIVACY.md without reading each routed provider's terms |
| **d. In-browser** | WebLLM Qwen3-1.7B / Llama-3.2-3B / Qwen3-4B (q4f16) | $0 | $0 | | first load = download of about 0.9–3.5 GB of weights; generation speed not measured | device-bound | Nothing leaves the device. The best privacy of any option |
| **e. MacBook + Ollama** | e.g. 8B q4 | electricity | about $0 | | not measured; single stream; prefill of 3.5K tokens on an old Mac is likely 10–30 s (estimate, **unmeasured**) | 1 request at a time | Thomas's own machine. Data transits his home network |

[AA] = artificialanalysis.ai, fetched 2026-09-30. Its "latency" for gpt-oss is time to first answer token on its standard workload, so reasoning time is included.

### d. In-browser models, detail
- **WebLLM (MLC)** VRAM needs, from `web-llm/src/config.ts`: Llama-3.2-1B 879 MB; Qwen3-0.6B 1,403 MB; gemma-2-2b 1,895 MB; Qwen3-1.7B 2,037 MB; Llama-3.2-3B 2,264 MB; Qwen3-4B 3,432 MB; Qwen3-8B 5,696 MB. The first visit downloads roughly that much.
- **iOS:** Safari 26 ships WebGPU on iOS/iPadOS/macOS/visionOS (webkit.org WWDC25 post). **WKWebView, and so the Capacitor iOS app:** one secondary source (a dev.to hands-on) says WKWebView does not expose WebGPU. The WebKit post does not say either way. **Unverified; test on device before relying on it.** Secondary reports put iPhone Safari tab memory at about 1.5 GB in practice and 256 MB per storage binding. That rules out 3B+ models on most iPhones and makes 1.7B marginal.
- **Chrome Prompt API (Gemini Nano):** desktop only (Win 10/11, macOS 13+, Linux, ChromeOS Plus). **Not Android, not iOS.** Needs 22 GB free disk, more than 4 GB VRAM, 16 GB RAM (developer.chrome.com/docs/ai/prompt-api).
- **Quality for this task:** the dashboard prompt asks for three exact-format lines, a figure-first shape, "never invent a figure" and a no-restatement rule, over a 2.5K-token context. That is the hardest part of the task for a 1–4B model. The repo already went through two prompt rewrites on a 120B model to get it right (`dashboard.tsx` comment). Expect format breaks and invented comparisons from small models. The quality claim is **not tested**.
- **Verdict:** not viable as the main path for testers on phones. It could be an opt-in "private mode" on desktop later.

### e. Old MacBook serving Ollama, detail
- **Tunnels:** Cloudflare Tunnel uses an outbound-only `cloudflared` daemon, so no port opening is needed (developers.cloudflare.com). Its price was **not confirmed on a fetched page**. Tailscale Funnel is on all plans, only on ports 443/8443/10000, under a `*.ts.net` name, with "non-configurable bandwidth limits" (tailscale.com/kb/1223/funnel).
- **Sleep:** with the lid closed a MacBook sleeps unless it is on AC power with an external display, or sleep is disabled (`sudo pmset -a disablesleep 1`). `caffeinate -s` holds off system sleep only while on AC. A macOS update restart, a Wi-Fi drop or a power cut takes the lane down. Nothing restarts it unless a LaunchAgent does.
- **Throughput with 6–20 users:** Ollama on one Mac effectively serves one request at a time. One tester opening four pages queues four 3.5K-token prompts. On an old Intel or 8 GB M1 machine each could take tens of seconds (estimate, **not measured**; the MacBook's model and RAM are **TODO**). That is longer than the 12 s provider timeout (`openai-compat.ts:50`).
- **Power:** laptop under sustained load, roughly 20–40 W (estimate). About £5–10/mo at UK tariffs if it runs 24/7. Not measured.
- **Security:** a home machine becomes an internet-reachable service that receives users' financial summaries. The minimum is: tunnel plus a shared secret or Cloudflare Access service token so only the Render API can call it, Ollama bound to localhost, and the machine patched and FileVault'd. Thomas becomes the operator of a processing location that has to be listed in `PRIVACY.md` / `DATA-INVENTORY.md`.
- **Failover:** it would be one more chain lane behind the breaker. It is acceptable as a last lane for Thomas's own account. It is not a pilot backbone.

### "Run a local model when the user creates an account": what it could mean
1. **Download an in-browser model to the user's device at signup.** A 0.9–3.5 GB download before first use. It does not run in iPhone WKWebView (unverified, see above) and is poor at this prompt. It is possible only on desktop as an opt-in.
2. **Start a dedicated model server per account.** GPU cost scales per user, not per request. This is orders of magnitude worse than paying per token at this scale.
3. **Register the account against Thomas's MacBook.** The same single machine serves everyone, so signup changes nothing.

None of these is a sensible reading. "Local" only buys privacy, and only for option 1. The privacy goal can be met more cheaply with a no-training, DPA-backed paid API plus Groq's ZDR switch.

---

## 3. Recommendation

### Pilot: 6–20 testers

**Chain: Groq Developer (gpt-oss-120b) → Anthropic Haiku 4.5 → fail honestly.**

Why:
- Groq Developer is the cheapest fix. Add a card, and nothing changes in code, model or prompt. The TPM ceiling rises from 8K to 250K (secondary source; check in the Groq console after upgrading). Turn on **Zero Data Retention** in Data Controls.
- The second lane must be a **different vendor**, so one vendor's outage or quota does not take out both. Cerebras is ruled out by its controller terms, not by price. Haiku 4.5 is the strongest instruction-follower among the options with no-training-by-default commercial terms, and at pilot volume its higher price is small. It needs a new adapter: Anthropic's Messages API is not the OpenAI shape the current transport speaks.
- Alternative second lane if Thomas wants the cheapest option: **Gemini 2.5 Flash-Lite on the paid tier** ($0.76/1k, 0.32 s TTFT, "not used to improve our products").

**Monthly estimate.** Assumptions: 20 users × 8 calls/day × 30 days = **4,800 calls/mo**, 3.5K in / 1,024 out.

| Lane | If it served 100% | Expected |
| --- | --- | --- |
| Groq gpt-oss-120b | $5.47 | about $5 |
| Haiku 4.5 | $41.38 | about $2–4 at 5–10% fallthrough |
| **Total** | | **about $10/mo; worst case about $47** |

### Later: hundreds to thousands of users

**Chain: Groq Developer → Haiku 4.5 (or Gemini Flash-Lite paid) → fail honestly. Add server-side caching before scaling.**

Assumption: 1,000 active users × 8 calls/day = 240,000 calls/mo.

| | Cap (1,024 out) | Typical (400 out) |
| --- | --- | --- |
| Groq gpt-oss-120b, all traffic | $274 | $185 |
| + Haiku at 10% fallthrough | +$207 | +$132 |
| Gemini 2.5 FL instead of Haiku at 10% | +$18 | +$12 |
| Haiku only (for reference) | $2,069 | $1,320 |

Cost levers, in order:
1. **Server-side insight cache.** Store each insight per user keyed on a hash of the context text; regenerate only when the context changes. Insights are a function of the context, so four pages times several devices collapse to a handful of calls a day. Likely a 50–80% cut (estimate).
2. Cap `max_tokens` for the three-line insights at about 400. Set `reasoning_effort: low` on gpt-oss for insights, so reasoning tokens do not fill the budget.
3. Move the briefing and non-urgent insights to Groq Batch or Anthropic Batch, both at 50% off.
4. Anthropic prompt caching on the 620-token system prompt (cache read is 0.1×). The saving is modest because the context changes per user.

### Code changes the recommendation implies (not made)
1. **Handle 429 properly** in `openai-compat.ts:202-210, 356-364`. Read `retry-after`, and either fall through immediately without counting it as a breaker failure, or wait if the delay is under about 2 s. A 429 means "slow down", not "lane dead". A 402 or 401 should open the breaker for a long time and alert, because it will not fix itself.
2. **Boot verification should POST a 1-token completion,** not only GET /models. That gap is exactly why the Cerebras 402 went unseen (`cerebras.ts:31-36`).
3. **Stagger or serialise insight calls per user,** so opening four pages does not fire four 3.5K-token prompts in the same second. A server-side queue, or lazy loading below the fold, would do it.
4. Remove the Cerebras lane and its three UI strings, as the vault already decided, and add the Haiku (or Gemini) adapter.
5. **Update `docs/DATA-INVENTORY.md` §4.1 and `PRIVACY.md`** to name the new processor, and record the reversal of "add no paid provider" in `Efforts/Numeris-Decisions.md`.

---

## 4. What the UI shows when every provider fails

Rule: *never show a number the API did not supply.*
- Show **an empty state with a plain sentence and a retry**, the shape already used in `dashboard.tsx:933-941`. Say what is wrong in words, with no figures and no placeholder insight lines: for example "AI insights are unavailable right now. Your figures above are unaffected." Offer **Try again** and, if the server knows it, "Retry after 30 s".
- **Never** show placeholder or template insights such as "£—/mo — …", and never show skeleton rows that look like data.
- **A stale cached insight** (sessionStorage today, server cache later) may be shown only with its age stated ("from 14:02, before your latest transactions"). If the context hash has changed since then, show the empty state instead, because its figures may no longer match the screen.
- Keep the existing `reducedCapacity` chrome when the fallback lane served the answer (`chain.ts:40-41`, `routes/ai.ts:232-235`).
- **Separate risk to flag:** an LLM insight can itself contain a figure the API did not supply, because the model invented it. The prompt forbids this, but nothing enforces it. A cheap guard is to reject any insight line whose leading figure does not appear verbatim in `context.text`. That brings AI output under the same rule.

---

## 5. Sources (fetched 2026-09-30 unless marked)

Official:
- Groq models and prices: https://console.groq.com/docs/models
- Groq rate limits (free-tier numbers, 429 plus `retry-after`): https://console.groq.com/docs/rate-limits
- Groq pricing page https://groq.com/pricing: **fetched but showed no prices**
- Cerebras rate limits (free and Developer tiers): https://inference-docs.cerebras.ai/support/rate-limits
- Cerebras pricing https://www.cerebras.ai/pricing: **fetched, prices did not render.** The $0.35/$0.75 figure is from secondary sources (morphllm.com/cerebras-pricing, pricepertoken.com)
- Gemini pricing and paid-tier data use: https://ai.google.dev/gemini-api/docs/pricing
- OpenAI pricing: https://developers.openai.com/api/docs/pricing (openai.com/api/pricing returned **403**). OpenAI's data-use policy was **not fetched**
- DeepSeek pricing: https://api-docs.deepseek.com/quick_start/pricing
- DeepSeek privacy: https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html (read through a search summary, not directly)
- Mistral: https://mistral.ai/pricing and https://docs.mistral.ai/getting-started/models/models_overview/. **No API prices obtained**
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic training policy: https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
- OpenRouter fees and ZDR: https://openrouter.ai/pricing
- Chrome Prompt API: https://developer.chrome.com/docs/ai/prompt-api
- Safari 26 WebGPU: https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- WebLLM model VRAM: https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ (price not stated on that page)
- Tailscale Funnel: https://tailscale.com/kb/1223/funnel

Benchmarks and secondary sources:
- https://artificialanalysis.ai/models/gpt-oss-120b/providers
- https://artificialanalysis.ai/models/claude-4-5-haiku
- https://artificialanalysis.ai/models/gemini-2-5-flash-lite
- Groq Developer-tier limits (1K RPM / 250K TPM, card with no minimum): https://www.eesel.ai/blog/groq-pricing and https://benchlm.ai/free-tier/groq. **Not confirmed on Groq's own page**
- WKWebView lacks WebGPU and iPhone memory limits: https://dev.to/creeta/qwen3-in-the-browser-zero-keys-webllm-0283-hands-on-3ai2 and https://github.com/Nehanth/swarmllm/issues/65. **Unverified; test on device**

Repo and vault: file:line citations inline above; `docs/DATA-INVENTORY.md` §4.1; vault `Efforts/Numeris-Decisions.md:574-576`, `hot.md:89`.

### Not established
Typical context size (only the cap is known; the logs record `contextChars`, `routes/ai.ts:251`), real output tokens including reasoning, Groq Developer limits on Groq's own page, Cerebras official prices, Mistral prices, OpenAI and Anthropic retention windows, WKWebView WebGPU, and the MacBook's specs and throughput.

// Real output from the assistant's real prompt, for before/after comparison.
//
// Why this exists: the /ai/chat prompt is not covered by any test — the gate
// checks types and units, and neither says anything about whether the model
// explains or summarises. The only honest way to judge a prompt change is to
// read what the model actually writes with it, so this sends the SHIPPED
// system prompt and the SHIPPED portfolio context to a model and prints the
// completion verbatim.
//
// What is real here:
//   • SYSTEM_PROMPT, imported from routes/ai.ts — the exact string the server
//     sends, so editing the route changes this harness's output too.
//   • The context block, built by the real buildChatContext() against the real
//     dev database, wrapped in the same delimiters routes/ai.ts wraps it in.
//   • temperature and max_tokens, matching the chainChatStream call.
//   • The completion: a real model, not a canned string.
//
// What is NOT the production path, stated plainly: the model. This machine has
// no GROQ_API_KEY, CEREBRAS_API_KEY or OPENROUTER_API_KEY, so the three lanes
// the product actually walks cannot be reached from here. The completion below
// comes from a locally hosted model over Ollama's OpenAI-compatible endpoint.
// That is enough to answer the question the prompt change asks — does the
// wording make the assistant explain rather than summarise — and not enough to
// predict the exact prose Groq would return. Do not quote this output as
// "what the app says" without the model name attached.
//
// Usage:
//   cd artifacts/api-server
//   ./node_modules/.bin/tsx --env-file-if-exists=.env src/dev/ai-explain-shot.ts \
//     [--model=llama3.1:8b] [--email=seed@numeris.local] [--path=/] [--q="..."]

import { eq } from "drizzle-orm";
import { db, userTable } from "@workspace/db";
import { buildChatContext } from "../lib/ai-context";
import { SYSTEM_PROMPT } from "../routes/ai";

const OLLAMA = "http://localhost:11434/v1/chat/completions";

// Same knobs routes/ai.ts passes to chainChatStream, so the only variable
// between a before-run and an after-run is the prompt text itself.
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.7;

const DEFAULT_QUESTION = "How am I doing this month?";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit == null ? fallback : hit.slice(name.length + 3);
}

const model = arg("model", "llama3.1:8b");
const email = arg("email", "seed@numeris.local");
const path = arg("path", "/");
const question = arg("q", DEFAULT_QUESTION);

// Top-level await cannot be used here: this file transitively imports
// lib/market.ts, which still uses require(), and the combination makes the
// module format ambiguous to the loader. An async main() sidesteps it.
async function main(): Promise<void> {
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (row == null) {
    console.error(`no user with email ${email} in this database`);
    process.exit(1);
  }

  const context = await buildChatContext(row.id, path);
  // The prompt can only ask for what the context actually carries; printing
  // it is how you check that before writing a demand into the prompt.
  if (process.argv.includes("--show-context")) {
    console.log(context.text);
    process.exit(0);
  }
  // Byte-for-byte the wrapping routes/ai.ts applies.
  const systemPrompt = `${SYSTEM_PROMPT}\n\n--- USER PORTFOLIO CONTEXT (read-only data) ---\n${context.text}\n--- END CONTEXT ---`;

  const res = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      stream: false,
    }),
  });
  if (!res.ok) {
    console.error(`ollama ${res.status}: ${(await res.text()).slice(0, 400)}`);
    process.exit(1);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const answer = body.choices?.[0]?.message?.content;
  if (answer == null) {
    console.error("no completion in response");
    process.exit(1);
  }

  const words = answer.trim().split(/\s+/).length;
  console.log(`── model ${model} · prompt ${SYSTEM_PROMPT.length} chars · context ${context.text.length} chars`);
  console.log(`── dropped sections: ${context.sectionsDropped.length === 0 ? "none" : context.sectionsDropped.join(", ")}`);
  console.log(`── question: ${question}`);
  console.log(`── answer: ${words} words, ${answer.trim().length} chars\n`);
  console.log(answer.trim());

  process.exit(0);
}

void main();

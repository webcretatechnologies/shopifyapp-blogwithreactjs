/**
 * Provider-agnostic AI chat-completion client. AiArticleService.js calls callAiProvider(messages)
 * exactly like it used to call a Groq-only callGroq(messages) - same contract (an array of
 * {role, content} chat messages in, a raw JSON string out, parsed by the caller) - so switching
 * providers before launch is an AI_PROVIDER env var change plus that provider's own API key, not
 * a rewrite of the prompts, JSON parsing, retry/fallback logic, or credit-refund wiring that
 * already lives in AiArticleService.js.
 *
 * Providers wired up: "groq" (default), "openai", "claude" (Anthropic). Add a new one by writing
 * one more callXxx(messages) function below with the same (messages) -> Promise<string> shape,
 * and adding one case to both getProvider()'s switches (isAiProviderConfigured + callAiProvider).
 */

function getProvider() {
  return (process.env.AI_PROVIDER || "groq").toLowerCase().trim();
}

/**
 * Whichever provider is selected, is its API key actually set? Used to gate "is AI configured at
 * all" checks in AiArticleService.js - a shop with no AI provider configured is the normal,
 * expected no-AI-available mode (nothing to warn about), distinct from a configured provider that
 * then fails at call time (which does need the merchant-facing "degraded" warning).
 */
export function isAiProviderConfigured() {
  switch (getProvider()) {
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "claude":
      return !!process.env.ANTHROPIC_API_KEY;
    case "groq":
    default:
      return !!process.env.GROQ_API_KEY;
  }
}

export async function callAiProvider(messages) {
  switch (getProvider()) {
    case "openai":
      return callOpenAi(messages);
    case "claude":
      return callClaude(messages);
    case "groq":
    default:
      return callGroq(messages);
  }
}

/**
 * Same contract as callAiProvider, except it also parses the result and retries the WHOLE call
 * once more if that parse fails - not just malformed JSON that a provider's own API rejects
 * outright (callGroq already retries Groq's specific json_validate_failed 400 once), but any
 * response that comes back as a 200 OK yet still isn't valid JSON once parsed (a longer/more
 * detailed brief can push a generation long enough to read as truncated or malformed even when
 * the provider's own API accepted it, and this happens the same way regardless of which provider
 * is configured - Claude has no structural JSON enforcement at all, so it's the likeliest to need
 * this). Every real caller in AiArticleService.js wants a parsed object, not a string it has to
 * JSON.parse itself, so this is what they should call instead of callAiProvider + JSON.parse.
 */
export async function callAiProviderForJson(messages, { maxAttempts = 2 } = {}) {
  let lastParseError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // A genuine provider error (a real outage, a daily limit, bad auth) propagates immediately -
    // callGroq/callOpenAi/callClaude already decide internally what's worth retrying (a per-minute
    // 429, Groq's json_validate_failed), so anything they still throw is something a same-request
    // retry here wouldn't fix either; only a parse failure on an otherwise-successful response is
    // worth a full extra attempt.
    const raw = await callAiProvider(messages);
    try {
      return JSON.parse(raw);
    } catch {
      lastParseError = new Error("AI service returned output that wasn't valid JSON. Please try again.");
    }
  }
  throw lastParseError;
}

/** Groq's 429 body names the wait itself, e.g. "...try again in 11.9775s". Falls back to 2s. */
function parseGroqRetryAfterSeconds(body) {
  const m = String(body || "").match(/try again in\s+([\d.]+)s/i);
  const s = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(s) && s > 0 ? Math.min(s, 15) : 2;
}

// Groq's free tier caps both "tokens per minute" (TPM) and "tokens per day" (TPD) - the message
// names which one. A TPM limit clears in seconds, worth the one retry below. A TPD limit clears
// in however many minutes are left until Groq's daily reset - no amount of waiting inside one
// request gets there, so retrying it would just make the merchant wait ~15s for a call that was
// always going to fail, then fall back anyway. This tells them apart so only the first gets retried.
const isGroqDailyLimit = (body) => /tokens per day|\(TPD\)/i.test(String(body || ""));

// Groq's free-tier TPM cap (8000) counts input AND max_tokens together, not just what the model
// actually ends up writing - Groq reserves the whole max_tokens figure against the limit up
// front. A static max_tokens is a real trade-off, proven live: 4500 left enough input headroom
// for a detailed brief but truncated the completion mid-JSON on a genuinely long article
// ("json_validate_failed"); bumping it to a flat 7000 fixed the truncation but then rejected that
// same detailed-brief request outright with a 413 ("Requested 9284" > 8000) before generation
// even started - worse, not better. The only way to raise the completion budget without also
// risking a 413 is to size it to what THIS request's own input actually costs: the shorter the
// brief, the more room there is to raise it; the longer the brief, the more that headroom has to
// go to output that would otherwise truncate rather than to input that's already spent.
const GROQ_TPM_LIMIT = 8000;
const GROQ_TPM_SAFETY_MARGIN = 300; // char->token estimate is approximate; leaves slack either way
function estimateGroqMaxTokens(messages) {
  const totalChars = messages.reduce((sum, m) => sum + String(m.content || "").length, 0);
  // ~4 chars/token is the standard rough estimate for English text; good enough to stay clear of
  // an 8000 hard cap without needing a real tokenizer here.
  const estimatedInputTokens = Math.ceil(totalChars / 4);
  const available = GROQ_TPM_LIMIT - estimatedInputTokens - GROQ_TPM_SAFETY_MARGIN;
  return Math.max(2000, Math.min(6500, available));
}

/**
 * POSTs one chat-completion request to Groq's OpenAI-compatible API and returns the raw JSON
 * string. Retries once on a per-minute 429: free-tier Groq's per-minute token budget is tight
 * enough that this is routine, not exceptional, and it always names its own cooldown - waiting
 * that out once turns a fully working generation that happened to land badly into a
 * fallback-to-filler for a merchant, which was previously the only outcome. A daily-limit 429, or
 * anything other than a 429, still fails immediately - retrying either won't fix it within this
 * request.
 */
async function callGroq(messages, attempt = 0) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: estimateGroqMaxTokens(messages),
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429 && attempt === 0 && !isGroqDailyLimit(body)) {
      const waitSeconds = parseGroqRetryAfterSeconds(body);
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
      return callGroq(messages, attempt + 1);
    }
    // Groq's json_object mode occasionally can't coerce a particular generation into valid JSON
    // (code: "json_validate_failed") - a real, reproduced case: a detailed brief pushed the reply
    // long enough that it read as truncated/malformed mid-object. It's sampling variance, not a
    // property of the request itself, so one immediate retry (no wait needed - this isn't a rate
    // limit) has a good chance of succeeding on the same input.
    if (res.status === 400 && attempt === 0 && /json_validate_failed/i.test(body)) {
      return callGroq(messages, attempt + 1);
    }
    const reason = res.status === 429 && isGroqDailyLimit(body) ? "AI service's daily generation limit" : `AI service error (${res.status})`;
    throw new Error(`${reason}: ${body.slice(0, 300) || res.statusText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI service returned an empty response. Please try again.");
  return content;
}

/**
 * OpenAI's Chat Completions API is what Groq's own API deliberately mirrors - same messages
 * shape, same response_format: json_object, same choices[0].message.content response shape. Only
 * the endpoint, model env var, and 429 handling (OpenAI's error body doesn't name its own cooldown
 * the way Groq's does, so this is one flat 2s retry rather than parsing a wait time that isn't
 * there) differ from callGroq.
 */
async function callOpenAi(messages, attempt = 0) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 7000,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      return callOpenAi(messages, attempt + 1);
    }
    throw new Error(`AI service error (${res.status}): ${body.slice(0, 300) || res.statusText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI service returned an empty response. Please try again.");
  return content;
}

/**
 * Anthropic's Messages API has a genuinely different shape from OpenAI/Groq's, not just a
 * different URL: the system prompt is a top-level `system` string (not a role:"system" message
 * mixed into the array), auth is `x-api-key` + an `anthropic-version` header (not
 * `Authorization: Bearer`), there's no response_format: json_object equivalent (JSON-only output
 * has to be requested via the prompt itself), and the reply comes back as
 * `content: [{type:"text", text}]` rather than `choices[0].message.content`.
 */
async function callClaude(messages, attempt = 0) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const conversation = messages.filter((m) => m.role !== "system");
  const system = `${systemMessage}\n\nRespond with raw JSON only - no markdown code fences, no prose before or after the JSON object.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, system, messages: conversation, max_tokens: 7000, temperature: 0.7 }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      return callClaude(messages, attempt + 1);
    }
    throw new Error(`AI service error (${res.status}): ${body.slice(0, 300) || res.statusText}`);
  }

  const data = await res.json();
  const content = data.content?.find((block) => block.type === "text")?.text;
  if (!content) throw new Error("AI service returned an empty response. Please try again.");
  // Claude sometimes wraps JSON in ```json fences despite the instruction not to - strip them
  // rather than let the caller's JSON.parse fail on a fenced response.
  return content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

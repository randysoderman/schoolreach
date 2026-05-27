// Provider-agnostic LLM adapter for extraction tasks.
// Default provider chosen via env vars:
//   LLM_EXTRACT_PROVIDER = 'gemini' | 'anthropic'  (defaults: gemini if GEMINI_API_KEY set, else anthropic)
//
// Gemini 2.0 Flash:
//   - Free tier: generous (15 RPM, ~1M tokens/day on free)
//   - Paid: ~$0.075/M input tokens (≈8x cheaper than Anthropic Haiku)
//   - Supports native JSON mode (responseMimeType: application/json) — no fence-stripping needed
//
// Anthropic Haiku 4.5:
//   - $1/M input, $5/M output
//   - Rate limits depend on usage tier; free/unfunded tier is very tight (10K input / 4K output per minute)

import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_EXTRACT_MODEL = "claude-haiku-4-5-20251001";
const GEMINI_EXTRACT_MODEL = "gemini-2.5-flash";

let cachedAnthropic: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Get one at https://console.anthropic.com/.",
    );
  }
  cachedAnthropic = new Anthropic({ apiKey });
  return cachedAnthropic;
}

export type LlmProvider = "anthropic" | "gemini";

/** Resolve the configured extraction provider. Defaults to gemini if available. */
export function extractionProvider(): LlmProvider {
  const explicit = process.env.LLM_EXTRACT_PROVIDER?.toLowerCase();
  if (explicit === "anthropic" || explicit === "gemini") return explicit;
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "anthropic";
}

/**
 * Send a prompt to the configured extraction LLM and return the text response.
 * Both providers are instructed to return JSON; the caller still does
 * JSON.parse + Zod validation, but Gemini's responseMimeType guarantees
 * valid JSON (no markdown fences), and Anthropic falls back to the existing
 * stripFences helper.
 */
export async function callExtractLlm(
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const provider = extractionProvider();
  if (provider === "gemini") return callGemini(prompt, maxTokens);
  return callAnthropic(prompt, maxTokens);
}

async function callAnthropic(prompt: string, maxTokens: number): Promise<string> {
  const client = anthropicClient();
  const message = await client.messages.create({
    model: ANTHROPIC_EXTRACT_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

async function callGemini(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get one (free) at https://aistudio.google.com/apikey.",
    );
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EXTRACT_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: maxTokens,
        temperature: 0.1,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Gemini ${res.status} ${res.statusText}: ${body.slice(0, 500)}`,
    );
  }
  const json = await res.json();
  const text: string | undefined =
    json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ?? "";
}

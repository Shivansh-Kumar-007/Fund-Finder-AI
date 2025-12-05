import OpenAI from "openai";

import {
  FundingOpportunity,
  fundingOpportunitySchema,
} from "./funding-output-schema";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

type RepairInput = {
  summary: string | null | undefined;
  url?: string;
  title?: string;
  text?: string;
  countries?: string[];
  industry?: string;
};

export async function repairFundingSummary(
  input: RepairInput
): Promise<FundingOpportunity[]> {
  if (!process.env.OPENAI_API_KEY) {
    return [];
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const instructions = `
You are given raw content from web search (title/text/URL) and possibly a broken JSON summary.
Return ONLY a JSON array of funding opportunity objects. Each object must include:
- name (string)
- website (string, absolute URL)
- applicableCountries (array of strings; can be empty if unknown)
- relevantIndustry (string; fallback to provided industry or "Artificial Intelligence" if unknown)
- fundingAmount (string; optional, include when present)
- summary (string; brief description)

IMPORTANT FILTERING RULES:
- ONLY include opportunities that are applicable to the target countries provided below.
- If applicableCountries is specified in the source, it MUST include at least one of the target countries.
- If applicableCountries cannot be determined from the source, include the opportunity with an empty array.
- Do NOT include opportunities that explicitly mention OTHER countries but NOT the target countries.
- Do NOT include funding opportunities that are OUTDATED or EXPIRED (older than 4 years, or clearly marked as closed/past deadlines).
- SKIP any content that references programs from before 2021 or has expired application deadlines.

Other Rules:
- Do NOT invent values not implied by the text; if a field is unknown, use an empty string (or empty array for countries).
- Prefer the provided URL for website when none is found in the text.
- Keep summaries under 600 characters.
- Output must be valid JSON and nothing else.`;

  const contextParts = [
    input.summary ? `Broken summary: ${input.summary}` : null,
    input.title ? `Title: ${input.title}` : null,
    input.text ? `Text: ${input.text}` : null,
    input.url ? `URL: ${input.url}` : null,
  ].filter(Boolean);

  const userContent = [
    contextParts.join("\n\n"),
    `Fallback industry: ${input.industry ?? "Artificial Intelligence"}`,
    `TARGET COUNTRIES (only include opportunities applicable to these): ${
      input.countries?.join(", ") ?? ""
    }`,
  ].join("\n\n");

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userContent },
    ],
  });

  const message = response.choices[0]?.message?.content;
  if (!message) return [];

  try {
    const parsed = JSON.parse(message);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const valid: FundingOpportunity[] = [];
    for (const item of arr) {
      const res = fundingOpportunitySchema.safeParse(item);
      if (res.success) {
        valid.push(res.data);
      }
    }
    return valid;
  } catch (error) {
    console.error("Failed to parse LLM repair JSON:", error);
    return [];
  }
}

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
You are an expert in sustainable, lower-emission agriculture funding. You gather information from public, global, and regional sustainability programs, climate finance mechanisms, utility rebates, tax incentives, carbon market programs, and innovation/R&D grants relevant to agriculture.

Extract funding opportunities from the provided web search content and return ONLY a JSON array. Each object must include:
- name (string): Name of the funding program or grant
- website (string): Direct URL to the funding opportunity
- applicableCountries (array of strings): Countries where this funding is available; can be empty if unknown
- relevantIndustry (string): Industry or sector (agriculture, food processing, manufacturing, etc.)
- fundingAmount (string, optional): Amount or range of funding available
- summary (string): Brief description covering what the funding supports and key application requirements

SCOPE & INCLUSION:
- Include sustainability programs, climate finance, carbon markets, tax incentives, utility rebates
- Include innovation funding (R&D grants, pilot/demonstration funds, commercialization support) when relevant to lower-emission agriculture
- Include programs supporting sustainable production, emissions reduction, renewable energy in agriculture, circular economy
- EXCLUDE general innovation funds without clear sustainability or agricultural connection
- EXCLUDE unrelated business/tech grants that don't address climate, emissions, or sustainable agriculture

FILTERING RULES:
- ONLY include opportunities applicable to TARGET COUNTRIES specified below
- If applicableCountries is mentioned in source, it MUST include at least one target country
- If country applicability cannot be determined, include with empty array
- Do NOT include opportunities explicitly limited to OTHER countries (not in target list)
- Do NOT include OUTDATED/EXPIRED programs (older than 1 year, before 2022, or closed deadlines)
- SKIP webpages or content dated before 2022
- SKIP any funding with expired application dates or marked as closed/historical
- Only include active, current, or upcoming funding opportunities

ACCURACY RULES:
- Do NOT invent information not present in the source text
- If a field is unknown/uncertain, use empty string or empty array
- When details are missing, note gaps clearly in the summary (e.g., "Amount not specified")
- Use the provided URL for website when none found in text
- Keep summaries under 600 characters but ensure clarity
- Output must be valid JSON only, no markdown or explanation

Focus on practical, real-world funding for agricultural operations seeking climate-aligned support.`;

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

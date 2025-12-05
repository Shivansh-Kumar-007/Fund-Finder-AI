import { getExa } from "../exa-client";
import { Supplier, supplierSchema } from "./supplier-output-schema";

type SupplierSearchOptions = {
  ingredient: string;
  countries?: string[];
  keywords?: string;
  limit?: number;
};

const supplierSummarySchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Supplier",
  type: "object",
  properties: {
    suppliers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Supplier name" },
          website: { type: "string", description: "URL for the supplier" },
          country: { type: "string", description: "Country of the supplier" },
          city: { type: "string", description: "City of the supplier" },
          summary: { type: "string", description: "What they supply / capabilities" },
          products: { type: "array", items: { type: "string" } },
        },
        required: ["name", "website", "summary"],
      },
    },
  },
  required: ["suppliers"],
} as const;

const DEFAULT_TEXT_OPTIONS = {
  text: { maxCharacters: 1200 },
  highlights: { numSentences: 3 },
};

function normalizeSuppliers(
  parsed: unknown,
  fallback: { url: string; title?: string | null; text?: string | null }
): Supplier[] {
  try {
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
  } catch {
    // ignore
  }

  const suppliersArray =
    (parsed as any)?.suppliers && Array.isArray((parsed as any).suppliers)
      ? (parsed as any).suppliers
      : [];

  const validated: Supplier[] = [];
  for (const s of suppliersArray) {
    const res = supplierSchema.safeParse(s);
    if (res.success) {
      validated.push(res.data);
    }
  }

  if (validated.length > 0) {
    return validated;
  }

  // fallback
  const summary = fallback.text || fallback.title || fallback.url;
  return [
    {
      name: fallback.title || fallback.url,
      website: fallback.url,
      country: undefined,
      city: undefined,
      summary: summary ?? "",
      products: [],
    },
  ];
}

export async function findSuppliers(options: SupplierSearchOptions): Promise<Supplier[]> {
  const exa = getExa();
  const { ingredient, countries = [], keywords = "", limit = 10 } = options;

  const countryFragment = countries.length > 0 ? ` in ${countries.join(" or ")}` : "";
  const query = `${ingredient} supplier${countryFragment} ${keywords} manufacturer distributor wholesale contact`;

  const res = await exa.searchAndContents(query, {
    summary: { schema: supplierSummarySchema },
    numResults: Math.max(limit, 5),
    livecrawl: "always",
    type: "keyword",
    useAutoprompt: true,
    ...DEFAULT_TEXT_OPTIONS,
  });

  const suppliers: Supplier[] = [];
  for (const r of res.results) {
    const fallback = {
      url: r.url,
      title: (r as any).title ?? null,
      text: (r as any).text ?? (Array.isArray((r as any).highlights) ? (r as any).highlights.join(" ") : null),
    };
    const parsedSuppliers = normalizeSuppliers((r as any).summary, fallback);
    suppliers.push(...parsedSuppliers);
    if (suppliers.length >= limit) break;
  }

  // de-dupe by website
  const seen = new Set<string>();
  const deduped: Supplier[] = [];
  for (const s of suppliers) {
    const key = s.website.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

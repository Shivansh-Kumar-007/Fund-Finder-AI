export type SourceTypeKey =
  | "commodity_index"
  | "major_vendor"
  | "trade_stats"
  | "supplier_quote"
  | "industry_report"
  | "web_secondary"
  | "anecdotal";

export type DerivationType =
  | "direct_local"
  | "direct_regional"
  | "inferred_regional"
  | "inferred_material_analog"
  | "heuristic";

export type ProximityKey =
  | "same_cluster"
  | "same_country_same_market"
  | "same_country_different_market"
  | "neighboring_country"
  | "same_region"
  | "different_region";

export type SourceEntry = {
  type: SourceTypeKey;

  ageMonths?: number;

  observedAt?: string | Date | number; // ISO date or timestamp to derive recency

  rawPriceUsdPerKg?: number;
};

export type QualityScores = {
  recency: number;
  source: number;
  estimation: number;
  consistency: number;
  proximity: number;
  composite: number;
  band: QualityBand;
};

export type QualityBand = "high" | "medium" | "low_medium" | "low";

const SOURCE_TYPE_SCORE: Record<SourceTypeKey, number> = {
  commodity_index: 80,
  major_vendor: 75,
  trade_stats: 70,
  supplier_quote: 65,
  industry_report: 55,
  web_secondary: 30,
  anecdotal: 15,
};

const DERIVATION_SCORE: Record<DerivationType, number> = {
  direct_local: 100,
  direct_regional: 85,
  inferred_regional: 70,
  inferred_material_analog: 60,
  heuristic: 40,
};

const PROXIMITY_SCORE: Record<ProximityKey, number> = {
  same_cluster: 100,

  same_country_same_market: 80,

  same_country_different_market: 60,

  neighboring_country: 45,

  same_region: 30,

  different_region: 15,
};

function parseObservedAt(observedAt?: string | Date | number): Date | undefined {
  if (observedAt == null) return undefined;
  if (observedAt instanceof Date) {
    return Number.isNaN(observedAt.getTime()) ? undefined : observedAt;
  }
  if (typeof observedAt === "number") {
    const d = new Date(observedAt);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof observedAt === "string") {
    let s = observedAt.trim();
    if (/^\d{4}$/.test(s)) {
      s = `${s}-01-01`;
    } else if (/^\d{4}-\d{1,2}$/.test(s)) {
      s = `${s}-01`;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.floor((to.getTime() - from.getTime()) / msPerDay);
  return diff < 0 ? 0 : diff;
}

export function scoreRecency(ageMonths?: number, observedAt?: string | Date | number): number {
  const sanitizedAgeMonths = Number.isNaN(ageMonths) ? undefined : ageMonths;

  // Derive recency from observedAt when available. If both are present, keep the
  // older (larger) age to avoid mistakenly treating stale data as fresh (e.g. ageMonths=0 with an old observedAt date).
  const derivedMonths = (() => {
    if (observedAt === undefined) return undefined;
    const observed = parseObservedAt(observedAt);
    if (!observed) return undefined;
    const now = new Date();
    const derivedDays = daysBetween(observed, now);
    return derivedDays / 30; // approximate month length
  })();

  if (
    derivedMonths !== undefined &&
    (sanitizedAgeMonths === undefined || derivedMonths > sanitizedAgeMonths)
  ) {
    ageMonths = derivedMonths;
  } else {
    ageMonths = sanitizedAgeMonths;
  }

  // Prefer explicit month-based recency for yearly/monthly wholesale data.
  if (ageMonths !== undefined && !Number.isNaN(ageMonths)) {
    if (ageMonths <= 1) return 100;
    if (ageMonths <= 3) return 80;
    if (ageMonths <= 6) return 50;
    if (ageMonths <= 12) return 35;
    return 20;
  }

  return 50; // neutral when unknown
}

export function scoreSourceType(type: SourceTypeKey | undefined): number {
  if (!type) {
    return 50; // neutral fallback
  }
  return SOURCE_TYPE_SCORE[type] ?? 40;
}

export function scoreDerivation(type: DerivationType | undefined): number {
  if (!type) {
    return 50;
  }
  return DERIVATION_SCORE[type] ?? 50;
}

export function scoreProximity(key: ProximityKey | undefined): number {
  if (!key) {
    return 50;
  }
  return PROXIMITY_SCORE[key] ?? 50;
}

export function scoreConsistency(prices: Array<number | undefined>): number {
  const clean = prices.filter((p): p is number => typeof p === "number" && !Number.isNaN(p));
  if (clean.length <= 1) {
    return 70; // neutral-ish when no variance info
  }
  const mean = clean.reduce((acc, val) => acc + val, 0) / clean.length;
  if (mean === 0) {
    return 30;
  }
  const variance =
    clean.reduce((acc, val) => {
      const diff = val - mean;
      return acc + diff * diff;
    }, 0) / clean.length;
  const stdev = Math.sqrt(variance);
  const relativeSpread = stdev / mean;
  if (relativeSpread <= 0.05) return 100;
  if (relativeSpread <= 0.15) return 80;
  if (relativeSpread <= 0.3) return 60;
  return 30;
}

function bandFromScore(score: number): QualityBand {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  if (score >= 40) return "low_medium";
  return "low";
}

export function computeQualityScore(params: {
  sources: SourceEntry[];
  derivationType?: DerivationType;
  proximity?: ProximityKey;
}): QualityScores {
  const { sources, derivationType, proximity } = params;
  const recencyScores = sources.map((s) => scoreRecency(s.ageMonths, s.observedAt));
  const sourceTypeScores = sources.map((s) => scoreSourceType(s.type));
  const prices = sources.map((s) => s.rawPriceUsdPerKg);

  const recency =
    recencyScores.length > 0
      ? recencyScores.reduce((acc, val) => acc + val, 0) / recencyScores.length
      : 50;
  const source =
    sourceTypeScores.length > 0
      ? sourceTypeScores.reduce((acc, val) => acc + val, 0) / sourceTypeScores.length
      : 50;
  const estimation = scoreDerivation(derivationType);
  const consistency = scoreConsistency(prices);
  const proximityScore = scoreProximity(proximity);

  const composite =
    0.3 * recency + 0.25 * source + 0.2 * estimation + 0.15 * consistency + 0.1 * proximityScore;

  return {
    recency,
    source,
    estimation,
    consistency,
    proximity: proximityScore,
    composite,
    band: bandFromScore(composite),
  };
}

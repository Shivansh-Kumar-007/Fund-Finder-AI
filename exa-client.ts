import Exa from "exa-js";

let exaInstance: Exa | null = null;

export function getExa(): Exa {
  if (exaInstance) return exaInstance;
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error("EXA_API_KEY environment variable is required for domain searches.");
  }
  exaInstance = new Exa(apiKey);
  return exaInstance;
}

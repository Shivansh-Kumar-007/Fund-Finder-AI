import Exa from "exa-js";

const apiKey = process.env.EXA_API_KEY || "b873c7aa-129e-408d-9f29-2cc309b468da";

if (!apiKey) {
  throw new Error("EXA_API_KEY environment variable is required for domain searches.");
}

export const exa = new Exa(apiKey);

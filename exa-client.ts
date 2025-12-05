import Exa from "exa-js";

const apiKey = process.env.EXA_API_KEY;

if (!apiKey) {
  throw new Error("EXA_API_KEY environment variable is required for domain searches.");
}

export const exa = new Exa(apiKey);

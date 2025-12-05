import { UIMessage } from "ai";
import z from "zod";

export type WorkflowState =
  | { step: "start" }
  | { step: "UserInput-ProductDesc" }
  | { step: "UserInput-ingredientFunction" }
  | { step: "UserInput-getIngToReplace" }
  | { step: "UserInput-confirmInitiative" }
  | { step: "InvalidRevert" }
  | { step: "end" };

const altIngLocItem = z.object({
  ingredientName: z.string(),
  countryCode: z.string(),
  countryName: z.string(),
  url: z.string(),
  source: z.string().optional(),
  efChangePercentage: z.number().nullable().optional(),
});

export type AltIngLoc = z.infer<typeof altIngLocItem>;

export const altIngLocsSchema = z.array(altIngLocItem).max(5);

export type AltIngLocs = z.infer<typeof altIngLocsSchema>;

export type ScoOptimizerFlowData = WorkflowState & {
  __flow: "sco-optimizer-flow";
  payload?: Record<string, string>;
};

export type StrategiesChatMessage = UIMessage<
  { context?: { path: string; scenarioId?: string } },
  { flow: ScoOptimizerFlowData }
>;

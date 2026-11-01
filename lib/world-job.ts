import type { GenerateEvent } from "../pipeline/types";

/** Public progress only. Source photographs and API responses never appear here. */
export type WorldJob = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  events: GenerateEvent[];
  completed: number;
  total: number;
  error?: string;
  updatedAt: string;
};

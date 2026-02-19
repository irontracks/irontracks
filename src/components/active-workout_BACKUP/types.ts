export type UnknownRecord = Record<string, unknown>;

export type ReportHistoryItem = {
  ts: number;
  avgWeight: number | null;
  avgReps: number | null;
  totalVolume: number;
  topWeight: number | null;
  setsCount: number;
  name?: string;
};

export type ReportHistory = {
  version: number;
  exercises: Record<string, { name: string; items: ReportHistoryItem[] }>;
};

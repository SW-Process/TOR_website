import SystemLogs from "@/components/admin/SystemLogs";

const SOURCES = ["ingestion", "ai-pipeline", "application"] as const;

/** `?q=` and `?source=` pre-fill the filters (used by the capture card's "ดูเหตุผลรายตัว" link). */
export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string }>;
}) {
  const { q, source } = await searchParams;
  const initialSource = SOURCES.find((s) => s === source);
  return <SystemLogs initialQuery={typeof q === "string" ? q : ""} initialSource={initialSource ?? ""} />;
}

import TORRecords from "@/components/admin/TORRecords";

export default async function AdminRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  return <TORRecords initialQuery={params.q ?? ""} />;
}

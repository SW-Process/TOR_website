import TORExplorer from "@/components/TORExplorer";
import { parseTorFilters, toUrlParams, type RawSearchParams } from "@/lib/torSearch";

export default async function TORPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseTorFilters(await searchParams);

  // Keyed by the filters so a real navigation to a different /tor?… (e.g. the
  // header's "ใกล้ปิดรับ" link while already here) remounts with the new state.
  // TORExplorer reads the filters themselves from the URL (see there).
  return <TORExplorer key={toUrlParams(filters).toString()} />;
}

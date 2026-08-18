import TORExplorer from "@/components/TORExplorer";

export default async function TORPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}) {
  const params = await searchParams;

  return (
    <TORExplorer
      initialQuery={params.q ?? ""}
      initialCategory={params.category ?? ""}
      initialSort={params.sort ?? "newest"}
    />
  );
}

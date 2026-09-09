import { readFileSync } from "node:fs";
import { join } from "node:path";

const envExample = readFileSync(join(__dirname, "../../.env.example"), "utf8");

describe(".env.example covers the enrichment pipeline vars", () => {
  it.each([
    "EXTRACTOR",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_LOCATION",
    "VERTEX_MODEL",
    "MAX_AI_CALLS_PER_RUN",
    "INGEST_AGENCIES",
    "INGEST_LOOKBACK_DAYS",
    "STORAGE_DRIVER",
    "GCS_BUCKET",
  ])("documents %s", (key) => {
    expect(envExample).toMatch(new RegExp(`^#?\\s*${key}=`, "m"));
  });

  it("pins the model default to gemini-2.5-flash", () => {
    expect(envExample).toMatch(/^VERTEX_MODEL=gemini-2\.5-flash$/m);
  });
});

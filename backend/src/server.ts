import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/db";
import { markInterruptedRunsFailed } from "./ingestion/runIngestion";

const PORT = process.env.PORT || 8000;

async function start(): Promise<void> {
  await connectDB();
  const swept = await markInterruptedRunsFailed();
  if (swept > 0) console.log(`Marked ${swept} interrupted ingestion run(s) as failed`);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

void start();

import mongoose, { type ClientSession } from "mongoose";

/**
 * Run `work` as one transaction, so a multi-step change either happens entirely or not at
 * all (ASVS 2.3.3). MongoDB Atlas (a replica set) supports transactions; a standalone
 * `mongod` (local Docker, part of the test suite) doesn't, and there `work` runs without
 * a session. Every step must pass the session it's given to its queries.
 */
let supported: Promise<boolean> | null = null;

async function transactionsSupported(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) return false;
  const hello = (await db.admin().command({ hello: 1 })) as { setName?: string; msg?: string };
  return Boolean(hello.setName) || hello.msg === "isdbgrid";
}

export async function withTransaction<T>(work: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  supported ??= transactionsSupported().catch(() => false);
  if (!(await supported)) return work(undefined);
  return mongoose.connection.transaction((session) => work(session));
}

/** Forget whether the database supports transactions (tests that switch servers). */
export function resetTransactionSupport(): void {
  supported = null;
}

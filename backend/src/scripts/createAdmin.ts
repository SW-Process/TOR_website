/**
 * Create an admin account. Admins are never created via the public API.
 *
 *   npm run create-admin -- <email> <password>
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models";
import { newPasswordProblem } from "../utils/passwordPolicy";

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npm run create-admin -- <email> <password>");
    process.exit(1);
  }
  const problem = await newPasswordProblem(password, { email });
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.error(`A user with email ${email} already exists`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const user = new User({ email, role: "admin" });
  user.set("password", password);
  await user.save();

  console.log(`Created admin ${user.email} (${user.id})`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});

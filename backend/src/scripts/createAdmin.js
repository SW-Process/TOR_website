/**
 * Create an admin account. Admins are never created via the public API.
 *
 *   node src/scripts/createAdmin.js <email> <password>
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { User } = require("../models");

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: node src/scripts/createAdmin.js <email> <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters");
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
  user.password = password;
  await user.save();

  console.log(`Created admin ${user.email} (${user._id})`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});

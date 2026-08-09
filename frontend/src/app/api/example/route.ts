import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Example from "@/models/Example";

export async function GET() {
  await connectDB();
  const examples = await Example.find({}).lean();
  return NextResponse.json(examples);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  const doc = await Example.create({ title: body.title });
  return NextResponse.json(doc, { status: 201 });
}

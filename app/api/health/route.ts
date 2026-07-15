import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const aiBackend = process.env.AI_BACKEND === "hermes"
    ? "hermes"
    : process.env.AI_BACKEND === "openai" ? "openai" : process.env.HERMES_BASE_URL ? "hermes" : "openai";
  return NextResponse.json(
    { status: "ok", service: "roam-trip-planner", aiBackend, timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

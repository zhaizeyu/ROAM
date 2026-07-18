import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/auth";
import { findPlaceImage } from "../../../lib/place-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 220) return NextResponse.json({ error: "图片查询内容无效。" }, { status: 400 });
  const image = await findPlaceImage(query);
  return NextResponse.json({ image }, {
    headers: { "Cache-Control": image ? "private, max-age=3600, stale-while-revalidate=86400" : "no-store" },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { dbFetch, parseStations } from "@/lib/dbApi";

export async function GET(req: NextRequest) {
  const pattern = req.nextUrl.searchParams.get("q");
  if (!pattern) return NextResponse.json({ error: "q required" }, { status: 400 });

  try {
    const xml = await dbFetch(`/station/${encodeURIComponent(pattern)}`);
    const stations = parseStations(xml);
    return NextResponse.json(stations);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

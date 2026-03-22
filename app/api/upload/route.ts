import { NextRequest, NextResponse } from "next/server";

const BASE = "https://app.askditto.io";

export async function POST(req: NextRequest) {
  try {
    const key = process.env.DITTO_API_KEY;
    if (!key) throw new Error("DITTO_API_KEY not set");

    const { fileData, filename } = await req.json();
    if (!fileData || !filename) {
      return NextResponse.json({ error: "Missing file data" }, { status: 400 });
    }

    // Strip the data URL prefix (e.g. "data:image/png;base64,") to get raw base64
    const base64 = fileData.includes(",") ? fileData.split(",")[1] : fileData;

    const res = await fetch(`${BASE}/v1/media-assets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_data: base64,
        filename,
        encoding: "base64",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        throw new Error(json.error?.message || `Upload failed (${res.status})`);
      } catch {
        throw new Error(`Upload failed (${res.status})`);
      }
    }

    const data = await res.json();
    const mediaAssetId = data.media_asset?.id;
    if (!mediaAssetId) throw new Error("No media asset ID returned");

    return NextResponse.json({ mediaAssetId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

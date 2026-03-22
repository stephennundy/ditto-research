import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

function getUserMap(): Map<string, string> {
  const raw = process.env.AUTH_USERS || "";
  const map = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const [name, pass] = entry.split(":");
    if (name && pass) map.set(pass, name);
  }
  return map;
}

function sign(username: string): string {
  const secret = process.env.AUTH_SECRET || "fallback";
  const hmac = createHmac("sha256", secret).update(username).digest("hex");
  return `${username}:${hmac}`;
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const users = getUserMap();
    const username = users.get(password);

    if (!username) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    const token = sign(username);
    const res = NextResponse.json({ username });
    res.cookies.set("alaric_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("alaric_session", "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
  return res;
}

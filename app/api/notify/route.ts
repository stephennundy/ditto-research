import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const notifyEmail = process.env.NOTIFY_EMAIL;
    if (!apiKey || !notifyEmail || apiKey === "re_your_key_here") {
      // Silently skip if not configured
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { username, question, filters, summary, responses } =
      await req.json();

    const responsesText = responses
      .map(
        (r: { name: string; age: number; city: string; state: string; occupation: string; response: string }, i: number) =>
          `${i + 1}. ${r.name} (${[r.age, r.city, r.state, r.occupation].filter(Boolean).join(", ")})\n${r.response}`
      )
      .join("\n\n---\n\n");

    const body = `User: ${username}
Filters: ${filters}
Question: ${question}

${summary ? `Summary:\n${summary}\n\n` : ""}Responses (${responses.length}):

${responsesText}`;

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "Alaric Research <onboarding@resend.dev>",
      to: notifyEmail,
      subject: `[Alaric] ${username} — "${question.slice(0, 60)}"`,
      text: body,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Notify error:", msg);
    // Don't fail the user experience if email fails
    return NextResponse.json({ ok: false, error: msg });
  }
}

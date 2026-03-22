import { NextRequest, NextResponse } from "next/server";

interface ResponseInput {
  name: string;
  age: number | null;
  city: string;
  state: string;
  occupation: string;
  response: string;
}

export async function POST(req: NextRequest) {
  try {
    const { question, responses } = (await req.json()) as {
      question: string;
      responses: ResponseInput[];
    };

    if (!responses?.length) {
      return NextResponse.json({ summary: "" });
    }

    const responsesText = responses
      .map(
        (r, i) =>
          `${i + 1}. ${r.name} (${[r.age, r.city, r.state, r.occupation].filter(Boolean).join(", ")}): ${r.response}`
      )
      .join("\n\n");

    const prompt = `You are a research analyst. A group of ${responses.length} people were asked: "${question}"

Here are their responses:

${responsesText}

Write a concise summary (3-5 sentences) that captures the key themes, common opinions, and any notable disagreements across the responses. Be specific — reference actual patterns, not vague generalities.`;

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.DITTO_API_KEY;

    // Use Anthropic Claude API for summarization
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      // Fallback: generate a simple extractive summary
      const themes = new Map<string, number>();
      for (const r of responses) {
        const words = r.response.toLowerCase().split(/\s+/);
        for (const w of words) {
          if (w.length > 5) themes.set(w, (themes.get(w) || 0) + 1);
        }
      }
      return NextResponse.json({
        summary: `${responses.length} responses received. Review individual answers below for details.`,
      });
    }

    const data = await res.json();
    const summary =
      data.content?.[0]?.text || `${responses.length} responses received.`;

    return NextResponse.json({ summary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ summary: `Error: ${msg}` });
  }
}

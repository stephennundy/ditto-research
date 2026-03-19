import { NextRequest, NextResponse } from "next/server";

const BASE = "https://app.askditto.io";

async function ditto(path: string) {
  const key = process.env.DITTO_API_KEY;
  if (!key) throw new Error("DITTO_API_KEY not set");

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ditto API ${res.status}: ${text}`);
  }
  return res.json();
}

interface Persona {
  name?: string;
  agent_name?: string;
  age?: number;
  agent_age?: number;
  city?: string;
  agent_city?: string;
  state?: string;
  agent_state?: string;
  occupation?: string;
  agent_occupation?: string;
  reply?: string;
  response_text?: string;
}

function formatPersona(p: Persona) {
  return {
    name: p.agent_name ?? p.name ?? "Unknown",
    age: p.agent_age ?? p.age ?? null,
    city: p.agent_city ?? p.city ?? "",
    state: p.agent_state ?? p.state ?? "",
    occupation: p.agent_occupation ?? p.occupation ?? "",
    response: p.response_text ?? p.reply ?? "",
  };
}

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("jobId");
    const jobIdsParam = req.nextUrl.searchParams.get("jobIds");
    const studyId = req.nextUrl.searchParams.get("studyId");
    const total = parseInt(req.nextUrl.searchParams.get("total") ?? "12");

    // Free tier — single job ID
    if (jobId) {
      const resp = await ditto(`/v1/jobs/${jobId}`);
      const status = resp.status ?? "unknown";
      const results = resp.result?.results ?? [];
      const responded = results.filter((r: Persona) => r.reply);

      return NextResponse.json({
        status,
        responded: responded.length,
        total,
        done: status === "finished" && !resp.result?.partial,
        results: responded.map(formatPersona),
      });
    }

    // Paid tier — poll individual job IDs
    if (jobIdsParam) {
      const jobIds: string[] = JSON.parse(jobIdsParam);
      let finished = 0;
      const results: ReturnType<typeof formatPersona>[] = [];

      for (const jid of jobIds) {
        const resp = await ditto(`/v1/jobs/${jid}`);
        if (resp.status === "finished") {
          finished++;
          const r = resp.result;
          if (r?.response_text) {
            results.push({
              name: "Persona",
              age: null,
              city: "",
              state: "",
              occupation: "",
              response: r.response_text,
            });
          }
        }
      }

      // If all finished, get richer data from study endpoint
      if (finished === jobIds.length && studyId) {
        const studyResp = await ditto(
          `/v1/research-studies/${studyId}/questions`
        );
        const questions = studyResp.questions ?? [];
        if (questions.length > 0) {
          const answers = questions[questions.length - 1].answers ?? [];
          return NextResponse.json({
            status: "finished",
            responded: answers.length,
            total,
            done: true,
            results: answers.map(formatPersona),
          });
        }
      }

      return NextResponse.json({
        status: finished === jobIds.length ? "finished" : "polling",
        responded: finished,
        total,
        done: finished === jobIds.length,
        results,
      });
    }

    return NextResponse.json({ error: "jobId or jobIds required" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

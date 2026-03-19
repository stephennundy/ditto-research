import { NextRequest, NextResponse } from "next/server";

const BASE = "https://app.askditto.io";

async function ditto(method: string, path: string, body?: object) {
  const key = process.env.DITTO_API_KEY;
  if (!key) throw new Error("DITTO_API_KEY not set");

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ditto API ${res.status}: ${text}`);
  }
  return res.json();
}

function isFree() {
  return (process.env.DITTO_API_KEY ?? "").startsWith("rk_free_");
}

export async function POST(req: NextRequest) {
  try {
    const { question, filters } = await req.json();
    if (!question) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }

    if (isFree()) {
      // Free tier — single endpoint
      const resp = await ditto("POST", "/v1/free/questions", { question });
      return NextResponse.json({
        tier: "free",
        jobId: resp.job_id,
        total: resp.count ?? resp.agents?.length ?? 12,
      });
    }

    // Paid tier — recruit → study → question
    const size = filters?.size ?? 10;
    const groupFilters: Record<string, unknown> = { country: "USA" };
    if (filters?.ageMin) groupFilters.age_min = filters.ageMin;
    if (filters?.ageMax) groupFilters.age_max = filters.ageMax;
    if (filters?.gender) groupFilters.sex = filters.gender;
    if (filters?.state) groupFilters.state = filters.state.toUpperCase();
    if (filters?.city) groupFilters.city = filters.city;

    const group = await ditto("POST", "/v1/research-groups/recruit", {
      name: `Web ${new Date().toISOString().slice(0, 16)}`,
      group_size: size,
      filters: groupFilters,
    });

    const groupUuid = group.group?.uuid;
    if (!groupUuid) throw new Error("No group UUID");

    const study = await ditto("POST", "/v1/research-studies", {
      title: question.slice(0, 80),
      objective: question,
      shareable: true,
      research_group_uuid: groupUuid,
    });

    const studyId = study.study?.id;
    if (!studyId) throw new Error("No study ID");

    const qResp = await ditto(
      "POST",
      `/v1/research-studies/${studyId}/questions`,
      { question }
    );

    return NextResponse.json({
      tier: "paid",
      jobIds: qResp.job_ids,
      studyId,
      total: size,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

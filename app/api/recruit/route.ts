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
    // Try to extract JSON error message, fall back to status code
    try {
      const json = JSON.parse(text);
      throw new Error(json.error?.message || `Ditto API error ${res.status}`);
    } catch {
      throw new Error(`Ditto API error ${res.status} — please try again`);
    }
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { filters } = await req.json();

    const size = filters?.size ?? 10;
    const groupFilters: Record<string, unknown> = { country: "USA" };
    if (filters?.ageMin) groupFilters.age_min = filters.ageMin;
    if (filters?.ageMax) groupFilters.age_max = filters.ageMax;
    if (filters?.gender) {
      groupFilters.is_female = filters.gender === "Female";
    }
    if (filters?.state) groupFilters.state = filters.state.toUpperCase();
    if (filters?.city) groupFilters.city = filters.city;
    if (filters?.incomeMin || filters?.incomeMax) {
      groupFilters.income_annual_usd = {};
      if (filters.incomeMin) (groupFilters.income_annual_usd as Record<string, number>).min = filters.incomeMin;
      if (filters.incomeMax) (groupFilters.income_annual_usd as Record<string, number>).max = filters.incomeMax;
    }
    if (filters?.ethnicity) groupFilters.ethnicity = [filters.ethnicity];
    if (filters?.industry) groupFilters.industry = [filters.industry];
    if (filters?.isParent !== undefined && filters?.isParent !== null) groupFilters.is_parent = filters.isParent;
    if (filters?.religion) groupFilters.religion = [filters.religion];
    if (filters?.labourStatus) groupFilters.labour_status = [filters.labourStatus];
    if (filters?.occupation) groupFilters.occupation = [filters.occupation];
    if (filters?.description) groupFilters.description = filters.description;

    const group = await ditto("POST", "/v1/research-groups/recruit", {
      name: `Web ${new Date().toISOString().slice(0, 16)}`,
      group_size: size,
      filters: groupFilters,
    });

    const groupUuid = group.group?.uuid;
    if (!groupUuid) throw new Error("No group UUID");

    const agents = group.recruited_agents ?? group.group?.agents ?? [];

    const personas = agents.map((a: Record<string, unknown>) => ({
      id: a.id,
      name: a.name ?? "Unknown",
      age: a.age ?? null,
      city: a.city ?? "",
      state: a.state ?? "",
      occupation: a.occupation ?? "",
    }));

    return NextResponse.json({ groupUuid, personas });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

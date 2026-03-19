"use client";

import { useState, useRef, useCallback } from "react";

interface Persona {
  name: string;
  age: number | null;
  city: string;
  state: string;
  occupation: string;
  response: string;
}

interface PollData {
  status: string;
  responded: number;
  total: number;
  done: boolean;
  results: Persona[];
  error?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<li>/g, "- ")
    .replace(/<\/li>/g, "\n")
    .replace(/<b>(.*?)<\/b>/g, "$1")
    .replace(/<i>(.*?)<\/i>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    ageMin: "",
    ageMax: "",
    gender: "",
    state: "",
    city: "",
    size: "10",
  });

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<Persona[]>([]);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(
    (params: URLSearchParams, elapsed: number) => {
      fetch(`/api/poll?${params}`)
        .then((r) => r.json())
        .then((data: PollData) => {
          if (data.error) {
            setError(data.error);
            setLoading(false);
            return;
          }

          setStatus(`${data.responded}/${data.total} responded`);
          if (data.results?.length) {
            setResults(data.results);
          }

          if (data.done || elapsed > 240000) {
            setLoading(false);
            if (!data.results?.length) {
              setStatus("Completed — no responses received");
            }
            return;
          }

          timerRef.current = setTimeout(
            () => poll(params, elapsed + 15000),
            15000
          );
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    },
    []
  );

  const handleSubmit = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);
    setStatus("Submitting question...");
    stopPolling();

    try {
      const body: Record<string, unknown> = { question };
      const f: Record<string, unknown> = {};
      if (filters.ageMin) f.ageMin = parseInt(filters.ageMin);
      if (filters.ageMax) f.ageMax = parseInt(filters.ageMax);
      if (filters.gender) f.gender = filters.gender;
      if (filters.state) f.state = filters.state;
      if (filters.city) f.city = filters.city;
      if (filters.size) f.size = parseInt(filters.size);
      if (Object.keys(f).length) body.filters = f;

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setStatus(`Waiting for responses (first poll in 50s)...`);

      // Build poll params
      const params = new URLSearchParams();
      if (data.tier === "free") {
        params.set("jobId", data.jobId);
      } else {
        params.set("jobIds", JSON.stringify(data.jobIds));
        params.set("studyId", String(data.studyId));
      }
      params.set("total", String(data.total));

      timerRef.current = setTimeout(() => poll(params, 50000), 50000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      setLoading(false);
    }
  };

  const markdown = results
    .map((p, i) => {
      const loc = [p.city, p.state].filter(Boolean).join(", ");
      const demo = [p.age?.toString(), loc, p.occupation]
        .filter(Boolean)
        .join(", ");
      return `## ${i + 1}. ${p.name}\n**${demo}**\n\n${stripHtml(p.response)}`;
    })
    .join("\n\n---\n\n");

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Ditto Research</h1>
      <p className="text-gray-400 mb-8">
        Ask a question to 300K+ synthetic personas
      </p>

      <textarea
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-lg resize-y min-h-[100px] focus:outline-none focus:border-blue-500"
        placeholder="What matters most when choosing a florist?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        disabled={loading}
      />

      <button
        type="button"
        className="text-sm text-gray-400 mt-2 hover:text-gray-200"
        onClick={() => setShowFilters(!showFilters)}
      >
        {showFilters ? "Hide filters" : "Show filters (paid tier)"}
      </button>

      {showFilters && (
        <div className="grid grid-cols-2 gap-3 mt-3 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <input
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            placeholder="Age min"
            type="number"
            value={filters.ageMin}
            onChange={(e) => setFilters({ ...filters, ageMin: e.target.value })}
          />
          <input
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            placeholder="Age max"
            type="number"
            value={filters.ageMax}
            onChange={(e) => setFilters({ ...filters, ageMax: e.target.value })}
          />
          <select
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            value={filters.gender}
            onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
          >
            <option value="">Any gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <input
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            placeholder="State (e.g. NY)"
            maxLength={2}
            value={filters.state}
            onChange={(e) => setFilters({ ...filters, state: e.target.value })}
          />
          <input
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            placeholder="City"
            value={filters.city}
            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
          />
          <input
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            placeholder="Group size"
            type="number"
            min={1}
            max={20}
            value={filters.size}
            onChange={(e) => setFilters({ ...filters, size: e.target.value })}
          />
        </div>
      )}

      <button
        className="mt-4 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-colors"
        onClick={handleSubmit}
        disabled={loading || !question.trim()}
      >
        {loading ? "Working..." : "Ask"}
      </button>

      {(status || error) && (
        <div className="mt-6">
          {error && (
            <p className="text-red-400 bg-red-950 border border-red-900 rounded-lg p-3">
              {error}
            </p>
          )}
          {status && !error && (
            <div className="flex items-center gap-3 text-gray-300">
              {loading && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              <span>{status}</span>
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {results.length} Responses
            </h2>
            <button
              className="text-sm text-blue-400 hover:text-blue-300"
              onClick={() => navigator.clipboard.writeText(markdown)}
            >
              Copy as markdown
            </button>
          </div>

          {results.map((p, i) => {
            const loc = [p.city, p.state].filter(Boolean).join(", ");
            const demo = [p.age?.toString(), loc, p.occupation]
              .filter(Boolean)
              .join(", ");

            return (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-lg p-5"
              >
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-semibold text-lg">{p.name}</span>
                  {demo && (
                    <span className="text-sm text-gray-400">{demo}</span>
                  )}
                </div>
                <div className="text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {stripHtml(p.response)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

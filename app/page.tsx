"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

interface RecruitedPersona {
  id: number;
  name: string;
  age: number | null;
  city: string;
  state: string;
  occupation: string;
}

interface ResultPersona {
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
  results: ResultPersona[];
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
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [question, setQuestion] = useState("");
  const [filters, setFilters] = useState({
    ageMin: "",
    ageMax: "",
    gender: "",
    state: "",
    city: "",
    size: "10",
    incomeMin: "",
    incomeMax: "",
    ethnicity: "",
    industry: "",
    isParent: "",
    religion: "",
    labourStatus: "",
    occupation: "",
    description: "",
  });

  const [attachments, setAttachments] = useState<{ id: string; name: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<ResultPersona[]>([]);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persona selection state
  const [groupUuid, setGroupUuid] = useState<string | null>(null);
  const [personas, setPersonas] = useState<RecruitedPersona[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [recruiting, setRecruiting] = useState(false);
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState({ responded: 0, total: 0 });

  const filterSummary = (() => {
    const parts: string[] = [];
    if (filters.ageMin || filters.ageMax) parts.push(`Age: ${filters.ageMin || "any"}–${filters.ageMax || "any"}`);
    if (filters.gender) parts.push(`Gender: ${filters.gender}`);
    if (filters.state) parts.push(`State: ${filters.state}`);
    if (filters.city) parts.push(`City: ${filters.city}`);
    if (filters.incomeMin || filters.incomeMax) parts.push(`Income: $${filters.incomeMin || "0"}–$${filters.incomeMax || "any"}`);
    if (filters.ethnicity) parts.push(`Ethnicity: ${filters.ethnicity}`);
    if (filters.industry) parts.push(`Industry: ${filters.industry}`);
    if (filters.isParent) parts.push(`Parent: ${filters.isParent}`);
    if (filters.religion) parts.push(`Religion: ${filters.religion}`);
    if (filters.labourStatus) parts.push(`Employment: ${filters.labourStatus}`);
    if (filters.occupation) parts.push(`Occupation: ${filters.occupation}`);
    if (filters.description) parts.push(`Description: ${filters.description}`);
    if (filters.size) parts.push(`Group size: ${filters.size}`);
    return parts.length ? parts.join(" | ") : "No filters";
  })();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    if (file.size > 10 * 1024 * 1024) {
      setError("File too large (max 10MB)");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const preview = file.type.startsWith("image/") ? dataUrl : "pdf";

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData: dataUrl, filename: file.name }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAttachments(prev => [...prev, { id: data.mediaAssetId, name: file.name, preview }]);
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const usernameRef = useRef(username);

  useEffect(() => {
    fetch("/api/auth")
      .then(r => r.json())
      .then(data => {
        if (data.username) {
          setUsername(data.username);
          usernameRef.current = data.username;
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  };
  const questionRef = useRef(question);
  const filterSummaryRef = useRef(filterSummary);
  useEffect(() => { usernameRef.current = username; }, [username]);
  useEffect(() => { questionRef.current = question; }, [question]);
  useEffect(() => { filterSummaryRef.current = filterSummary; }, [filterSummary]);

  const generateSummary = useCallback((responses: ResultPersona[]) => {
    if (!responses.length) return;
    const currentQuestion = questionRef.current;
    const currentUsername = usernameRef.current;
    const currentFilters = filterSummaryRef.current;

    setSummarizing(true);
    fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: currentQuestion, responses: responses.map(r => ({
        name: r.name, age: r.age, city: r.city, state: r.state,
        occupation: r.occupation, response: stripHtml(r.response),
      }))})
    })
      .then(r => r.json())
      .then(data => {
        const s = data.summary || "";
        setSummary(s);
        // Send email notification
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUsername,
            question: currentQuestion,
            filters: currentFilters,
            summary: s,
            responses: responses.map(r => ({
              name: r.name, age: r.age, city: r.city, state: r.state,
              occupation: r.occupation, response: stripHtml(r.response),
            })),
          }),
        }).catch(() => {});
      })
      .catch(() => setSummary("Could not generate summary."))
      .finally(() => setSummarizing(false));
  }, []);

  const copyText = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

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

          setPollProgress({ responded: data.responded, total: data.total });
          setStatus(`${data.responded}/${data.total} responded`);

          if (data.done || elapsed > 240000) {
            setLoading(false);
            if (!data.results?.length) {
              setStatus("Completed — no responses received");
            } else {
              setResults(data.results);
              generateSummary(data.results);
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

  const handleRecruit = async () => {
    setRecruiting(true);
    setError("");
    setPersonas([]);
    setGroupUuid(null);
    setSelectedIds(new Set());

    try {
      const f: Record<string, unknown> = {};
      if (filters.ageMin) f.ageMin = parseInt(filters.ageMin);
      if (filters.ageMax) f.ageMax = parseInt(filters.ageMax);
      if (filters.gender) f.gender = filters.gender;
      if (filters.state) f.state = filters.state;
      if (filters.city) f.city = filters.city;
      if (filters.size) f.size = parseInt(filters.size);
      if (filters.incomeMin) f.incomeMin = parseInt(filters.incomeMin);
      if (filters.incomeMax) f.incomeMax = parseInt(filters.incomeMax);
      if (filters.ethnicity) f.ethnicity = filters.ethnicity;
      if (filters.industry) f.industry = filters.industry;
      if (filters.isParent) f.isParent = filters.isParent === "Yes";
      if (filters.religion) f.religion = filters.religion;
      if (filters.labourStatus) f.labourStatus = filters.labourStatus;
      if (filters.occupation) f.occupation = filters.occupation;
      if (filters.description) f.description = filters.description;

      const res = await fetch("/api/recruit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: f }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setRecruiting(false);
        return;
      }

      if (!data.personas?.length) {
        setError("No personas matched your filters. Try broadening your criteria.");
        setRecruiting(false);
        return;
      }

      setGroupUuid(data.groupUuid);
      setPersonas(data.personas);
      setSelectedIds(new Set(data.personas.map((p: RecruitedPersona) => p.id)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Recruit failed");
    } finally {
      setRecruiting(false);
    }
  };

  const handleAskSelected = async () => {
    if (!question.trim() || !groupUuid) return;

    setLoading(true);
    setError("");
    setResults([]);
    setStatus("Submitting question...");
    stopPolling();

    try {
      const excludeAgentIds = personas
        .filter((p) => !selectedIds.has(p.id))
        .map((p) => p.id);

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, groupUuid, excludeAgentIds, attachments: attachments.length ? attachments.map(a => a.id) : undefined }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setStatus("Waiting for responses (first poll in 50s)...");

      const params = new URLSearchParams();
      params.set("jobIds", JSON.stringify(data.jobIds));
      params.set("studyId", String(data.studyId));
      params.set("total", String(data.total));

      timerRef.current = setTimeout(() => poll(params, 50000), 50000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      setLoading(false);
    }
  };

  const handleFreeTierSubmit = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);
    setStatus("Submitting question...");
    stopPolling();

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setStatus("Waiting for responses (first poll in 50s)...");

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

  const handleStartOver = () => {
    stopPolling();
    setGroupUuid(null);
    setPersonas([]);
    setSelectedIds(new Set());
    setResults([]);
    setSummary("");
    setStatus("");
    setError("");
    setLoading(false);
    setPollProgress({ responded: 0, total: 0 });
    setAttachments([]);
  };

  const togglePersona = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === personas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(personas.map((p) => p.id)));
    }
  };

  const isPaidTier = personas.length > 0;

  const responsesMarkdown = results
    .map((p, i) => {
      const loc = [p.city, p.state].filter(Boolean).join(", ");
      const demo = [p.age?.toString(), loc, p.occupation]
        .filter(Boolean)
        .join(", ");
      return `## ${i + 1}. ${p.name}\n**${demo}**\n\n${stripHtml(p.response)}`;
    })
    .join("\n\n---\n\n");

  const markdown = [
    `# Question\n${question}`,
    `# Recruitment Filters\n${filterSummary}`,
    summary ? `# Summary\n${summary}` : "",
    `# Responses (${results.length})`,
    responsesMarkdown,
  ].filter(Boolean).join("\n\n");

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">Alaric Research</h1>
        {username && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{username}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Logout
            </button>
          </div>
        )}
      </div>
      <p className="text-gray-400 mb-8">
        Ask a question to 300K+ synthetic personas
      </p>

      {!isPaidTier && (
        <>
          <div className="grid grid-cols-2 gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800">
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Age min"
              type="number"
              value={filters.ageMin}
              onChange={(e) =>
                setFilters({ ...filters, ageMin: e.target.value })
              }
            />
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Age max"
              type="number"
              value={filters.ageMax}
              onChange={(e) =>
                setFilters({ ...filters, ageMax: e.target.value })
              }
            />
            <select
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              value={filters.gender}
              onChange={(e) =>
                setFilters({ ...filters, gender: e.target.value })
              }
            >
              <option value="">Any gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            <select
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              value={filters.state}
              onChange={(e) =>
                setFilters({ ...filters, state: e.target.value })
              }
            >
              <option value="">Any state</option>
              {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="City"
              value={filters.city}
              onChange={(e) =>
                setFilters({ ...filters, city: e.target.value })
              }
            />
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Group size"
              type="number"
              min={1}
              max={50}
              value={filters.size}
              onChange={(e) =>
                setFilters({ ...filters, size: e.target.value })
              }
            />
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Income min ($)"
              type="number"
              value={filters.incomeMin}
              onChange={(e) =>
                setFilters({ ...filters, incomeMin: e.target.value })
              }
            />
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Income max ($)"
              type="number"
              value={filters.incomeMax}
              onChange={(e) =>
                setFilters({ ...filters, incomeMax: e.target.value })
              }
            />
            <select
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              value={filters.ethnicity}
              onChange={(e) =>
                setFilters({ ...filters, ethnicity: e.target.value })
              }
            >
              <option value="">Any ethnicity</option>
              {["White","Hispanic or Latino","White (Non-Hispanic)","Black","Asian","Hispanic (Any race)","Some other race","Black (Non-Hispanic)","Asian (Non-Hispanic)","Two or more races (Non-Hispanic)","Two or more races","American Indian/Alaska Native","Native Hawaiian/Pacific Islander","American Indian/Alaska Native (Non-Hispanic)"].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              value={filters.religion}
              onChange={(e) =>
                setFilters({ ...filters, religion: e.target.value })
              }
            >
              <option value="">Any religion</option>
              {["Catholic","Unaffiliated","Evangelical Protestant","Mainline Protestant","Protestant","Black Protestant","Nothing in particular","Jewish","LDS","Agnostic","Atheist","Muslim","Buddhist","Hindu","Orthodox Christian","Jehovah's Witness","Other Christian","Other"].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              value={filters.labourStatus}
              onChange={(e) =>
                setFilters({ ...filters, labourStatus: e.target.value })
              }
            >
              <option value="">Any employment</option>
              {["Employed FT","Employed","Not in labor force","Unemployed","Military"].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              value={filters.isParent}
              onChange={(e) =>
                setFilters({ ...filters, isParent: e.target.value })
              }
            >
              <option value="">Parent status</option>
              <option value="Yes">Parent</option>
              <option value="No">Not a parent</option>
            </select>
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Occupation"
              value={filters.occupation}
              onChange={(e) =>
                setFilters({ ...filters, occupation: e.target.value })
              }
            />
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Industry"
              value={filters.industry}
              onChange={(e) =>
                setFilters({ ...filters, industry: e.target.value })
              }
            />
            <input
              className="col-span-2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Description (freetext persona search)"
              value={filters.description}
              onChange={(e) =>
                setFilters({ ...filters, description: e.target.value })
              }
            />

            <button
              className="col-span-2 mt-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-colors"
              onClick={handleRecruit}
              disabled={recruiting}
            >
              {recruiting ? "Recruiting..." : "Recruit Group"}
            </button>
          </div>

          <textarea
            className="w-full mt-4 bg-gray-900 border border-gray-700 rounded-lg p-4 text-lg resize-y min-h-[100px] focus:outline-none focus:border-blue-500"
            placeholder="Ask me a question here and be as specific as possible so the recruited panel can answer efficiently"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
          />

          <div className="mt-3 space-y-2">
            {attachments.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg">
                {a.preview === "pdf" ? (
                  <div className="w-12 h-12 bg-red-900 rounded flex items-center justify-center text-xs font-bold text-red-300">PDF</div>
                ) : (
                  <img src={a.preview} alt="attachment" className="w-12 h-12 object-cover rounded" />
                )}
                <span className="text-sm text-gray-300 flex-1 truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="text-sm text-gray-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {uploading ? "Uploading..." : "Attach image or PDF"}
              <input
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                onChange={handleFileUpload}
                disabled={uploading || loading}
              />
            </label>
          </div>
        </>
      )}

      {/* Paid tier: persona selection + ask */}
      {isPaidTier && !results.length && (
        <>
          <div className="mb-4 p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Recruitment Criteria</p>
            <p className="text-sm text-gray-300">{filterSummary}</p>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">
              Recruited Personas ({personas.length})
            </h2>
            <div className="flex gap-3">
              <button
                type="button"
                className="text-sm text-blue-400 hover:text-blue-300"
                onClick={toggleAll}
              >
                {selectedIds.size === personas.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-gray-200"
                onClick={handleStartOver}
              >
                Start Over
              </button>
            </div>
          </div>

          <div className="grid gap-2 mb-6">
            {personas.map((p) => {
              const loc = [p.city, p.state].filter(Boolean).join(", ");
              const demo = [p.age?.toString(), loc, p.occupation]
                .filter(Boolean)
                .join(" · ");
              const selected = selectedIds.has(p.id);

              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected
                      ? "bg-gray-900 border-blue-600"
                      : "bg-gray-950 border-gray-800 opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => togglePersona(p.id)}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <div>
                    <span className="font-medium">{p.name}</span>
                    {demo && (
                      <span className="text-sm text-gray-400 ml-2">
                        {demo}
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <textarea
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-lg resize-y min-h-[100px] focus:outline-none focus:border-blue-500"
            placeholder="Ask me a question here and be as specific as possible so the recruited panel can answer efficiently"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
          />

          <div className="mt-3 space-y-2">
            {attachments.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg">
                {a.preview === "pdf" ? (
                  <div className="w-12 h-12 bg-red-900 rounded flex items-center justify-center text-xs font-bold text-red-300">PDF</div>
                ) : (
                  <img src={a.preview} alt="attachment" className="w-12 h-12 object-cover rounded" />
                )}
                <span className="text-sm text-gray-300 flex-1 truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="text-sm text-gray-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {uploading ? "Uploading..." : "Attach image or PDF"}
              <input
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                onChange={handleFileUpload}
                disabled={uploading || loading}
              />
            </label>
          </div>

          <button
            className="mt-4 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-colors"
            onClick={handleAskSelected}
            disabled={loading || !question.trim() || selectedIds.size === 0}
          >
            {loading
              ? "Working..."
              : `Ask Selected (${selectedIds.size})`}
          </button>
        </>
      )}

      {error && (
        <div className="mt-6">
          <p className="text-red-400 bg-red-950 border border-red-900 rounded-lg p-3">
            {error}
          </p>
        </div>
      )}

      {loading && !error && (
        <div className="mt-6 p-4 bg-gray-900 border border-gray-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-300">
                {pollProgress.total > 0
                  ? `${pollProgress.responded}/${pollProgress.total} responded`
                  : "Submitting question..."}
              </span>
            </div>
            {pollProgress.total > 0 && (
              <span className="text-sm text-gray-500">
                {Math.round((pollProgress.responded / pollProgress.total) * 100)}%
              </span>
            )}
          </div>
          <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
            {pollProgress.total > 0 ? (
              <div
                className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${(pollProgress.responded / pollProgress.total) * 100}%`,
                }}
              />
            ) : (
              <div className="bg-blue-500 h-3 rounded-full w-1/3 animate-pulse" />
            )}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="mb-2 p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Recruitment Criteria</p>
            <p className="text-sm text-gray-300">{filterSummary}</p>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {results.length} Responses
            </h2>
            <div className="flex gap-3">
              <button
                className="text-sm text-blue-400 hover:text-blue-300"
                onClick={() => copyText(markdown, "all")}
              >
                {copiedId === "all" ? "Copied!" : "Copy all"}
              </button>
              <button
                className="text-sm text-blue-400 hover:text-blue-300"
                onClick={() => copyText(JSON.stringify({
                  question,
                  filters: filterSummary,
                  summary: summary || undefined,
                  responses: results.map(p => ({
                    name: p.name,
                    age: p.age,
                    city: p.city,
                    state: p.state,
                    occupation: p.occupation,
                    response: stripHtml(p.response),
                  })),
                }, null, 2), "json")}
              >
                {copiedId === "json" ? "Copied!" : "Copy JSON"}
              </button>
              <button
                className="text-sm text-gray-400 hover:text-gray-200"
                onClick={handleStartOver}
              >
                Start Over
              </button>
            </div>
          </div>

          {(summary || summarizing) && (
            <div className="bg-blue-950 border border-blue-900 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide mb-2">
                Summary
              </h3>
              {summarizing ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Generating summary...</span>
                </div>
              ) : (
                <div className="text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {summary}
                </div>
              )}
            </div>
          )}

          {results.map((p, i) => {
            const loc = [p.city, p.state].filter(Boolean).join(", ");
            const demo = [p.age?.toString(), loc, p.occupation]
              .filter(Boolean)
              .join(", ");
            const personaText = `${p.name} (${demo})\n\n${stripHtml(p.response)}`;

            return (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-lg p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-lg">{p.name}</span>
                    {demo && (
                      <span className="text-sm text-gray-400">{demo}</span>
                    )}
                  </div>
                  <button
                    className="text-xs text-gray-500 hover:text-gray-300"
                    onClick={() => copyText(personaText, `p-${i}`)}
                  >
                    {copiedId === `p-${i}` ? "Copied!" : "Copy"}
                  </button>
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

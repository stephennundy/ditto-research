#!/usr/bin/env python3
"""Ditto Research CLI — submit a question, poll for results, output markdown."""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE_URL = "https://app.askditto.io"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"


def api(method: str, path: str, body: dict | None = None) -> dict:
    """Make an authenticated API call to Ditto."""
    key = os.environ.get("DITTO_API_KEY")
    if not key:
        print("Error: DITTO_API_KEY environment variable not set.", file=sys.stderr)
        sys.exit(1)

    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, headers=headers, method=method)

    try:
        with urlopen(req) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        err_body = e.read().decode()
        print(f"API error {e.code} on {method} {path}: {err_body}", file=sys.stderr)
        sys.exit(1)


def is_free_tier() -> bool:
    key = os.environ.get("DITTO_API_KEY", "")
    return key.startswith("rk_free_")


def slugify(text: str) -> str:
    s = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", s).strip("-")[:50]


def strip_html(text: str) -> str:
    """Convert simple HTML to readable text."""
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<li>", "- ", text)
    text = re.sub(r"</li>", "\n", text)
    text = re.sub(r"<b>(.*?)</b>", r"**\1**", text)
    text = re.sub(r"<i>(.*?)</i>", r"*\1*", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


# ── Free tier ──────────────────────────────────────────────────────────

def ask_free(question: str) -> dict:
    """Free tier: POST to /v1/free/questions, returns response with job info."""
    return api("POST", "/v1/free/questions", {"question": question})


# ── Paid tier ──────────────────────────────────────────────────────────

def recruit_group(args) -> dict:
    filters = {"country": "USA"}
    if args.age_min:
        filters["age_min"] = args.age_min
    if args.age_max:
        filters["age_max"] = args.age_max
    if args.gender:
        filters["sex"] = args.gender.capitalize()
    if args.state:
        filters["state"] = args.state.upper()
    if args.city:
        filters["city"] = args.city

    body = {
        "name": f"CLI group {datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "group_size": args.size,
        "filters": filters,
    }
    print(f"Recruiting {args.size} personas...")
    return api("POST", "/v1/research-groups/recruit", body)


def create_study(group_uuid: str, question: str) -> dict:
    body = {
        "title": question[:80],
        "objective": question,
        "shareable": True,
        "research_group_uuid": group_uuid,
    }
    print("Creating study...")
    return api("POST", "/v1/research-studies", body)


def ask_question(study_id: int, question: str) -> dict:
    print("Submitting question...")
    return api("POST", f"/v1/research-studies/{study_id}/questions", {"question": question})


def poll_jobs(job_ids: list[str], total: int) -> list[dict]:
    """Poll job IDs until all finish. Returns results from finished jobs."""
    print(f"Waiting for {total} responses (first poll in 50s)...")
    time.sleep(50)

    finished_results = {}
    max_time = 240  # 4 minutes total
    start = time.time()
    poll_count = 0

    while time.time() - start < max_time:
        poll_count += 1
        all_done = True
        for jid in job_ids:
            if jid in finished_results:
                continue
            resp = api("GET", f"/v1/jobs/{jid}")
            status = resp.get("status", "")
            if status == "finished":
                result = resp.get("result", {})
                agent_id = result.get("agent_id")
                if agent_id:
                    finished_results[agent_id] = result
            elif status == "failed":
                finished_results[jid] = {"status": "failed", "job_id": jid}
            else:
                all_done = False

        done = len(finished_results)
        print(f"  Poll #{poll_count}: {done}/{total} responded")

        if all_done:
            break
        time.sleep(20)

    return list(finished_results.values())


def complete_study(study_id: int) -> dict | None:
    try:
        return api("POST", f"/v1/research-studies/{study_id}/complete", {"force": False})
    except SystemExit:
        print("  (Study completion failed, continuing...)", file=sys.stderr)
        return None


def get_share_link(study_id: int) -> str | None:
    try:
        resp = api("POST", f"/v1/research-studies/{study_id}/share", {"enabled": True})
        return resp.get("url") or resp.get("share_link") or resp.get("share_url")
    except SystemExit:
        return None


def get_study_answers(study_id: int) -> list[dict]:
    """Fetch full responses via the questions endpoint."""
    resp = api("GET", f"/v1/research-studies/{study_id}/questions")
    questions = resp.get("questions", [])
    if questions:
        return questions[-1].get("answers", [])
    return []


# ── Output ─────────────────────────────────────────────────────────────

def print_result(persona: dict, index: int):
    name = persona.get("agent_name") or persona.get("name", "Unknown")
    age = persona.get("agent_age") or persona.get("age", "")
    city = persona.get("agent_city") or persona.get("city", "")
    state = persona.get("agent_state") or persona.get("state", "")
    occupation = persona.get("agent_occupation") or persona.get("occupation", "")
    response = persona.get("response_text") or persona.get("reply", "")
    response = strip_html(response)

    loc = f"{city}, {state}" if city and state else city or state or ""
    demo = ", ".join(filter(None, [str(age), loc, occupation]))

    print(f"\n{'─' * 60}")
    print(f"  {index}. {name} ({demo})")
    print(f"{'─' * 60}")
    print(f"  {response[:2000]}")
    if len(response) > 2000:
        print("  [truncated in terminal — see full output in markdown file]")


def save_markdown(question: str, personas: list[dict], share_link: str | None = None):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = slugify(question)
    path = OUTPUT_DIR / f"{ts}_{slug}.md"

    lines = [
        f"# Ditto Research: {question}\n",
        f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n",
        f"**Respondents:** {len(personas)}\n",
    ]
    if share_link:
        lines.append(f"**Share Link:** {share_link}\n")
    lines.append("\n---\n")

    for i, p in enumerate(personas, 1):
        name = p.get("agent_name") or p.get("name", "Unknown")
        age = p.get("agent_age") or p.get("age", "")
        city = p.get("agent_city") or p.get("city", "")
        state = p.get("agent_state") or p.get("state", "")
        occupation = p.get("agent_occupation") or p.get("occupation", "")
        response = p.get("response_text") or p.get("reply", "")
        response = strip_html(response)

        loc = f"{city}, {state}" if city and state else city or state or ""
        demo = ", ".join(filter(None, [str(age), loc, occupation]))

        lines.append(f"\n## {i}. {name}\n")
        lines.append(f"**{demo}**\n")
        lines.append(f"\n{response}\n")

    path.write_text("\n".join(lines))
    print(f"\nSaved report: {path}")


# ── Free tier flow ─────────────────────────────────────────────────────

def run_free(question: str):
    print("Using FREE tier (shared personas, no filters)")
    resp = ask_free(question)

    job_id = resp.get("job_id")
    agents = resp.get("agents", [])
    agent_ids = resp.get("agent_ids", [])
    total = resp.get("count", len(agents))

    if not job_id:
        print("Error: No job_id returned.", file=sys.stderr)
        print(json.dumps(resp, indent=2))
        sys.exit(1)

    print(f"Job: {job_id} — {total} personas")
    print(f"Waiting for responses (first poll in 50s)...")
    time.sleep(50)

    max_time = 240
    start = time.time()
    poll_count = 0

    while time.time() - start < max_time:
        poll_count += 1
        resp = api("GET", f"/v1/jobs/{job_id}")
        status = resp.get("status", "")
        result = resp.get("result", {})
        results = result.get("results", [])
        responded = len([r for r in results if r.get("reply")])

        print(f"  Poll #{poll_count}: {responded}/{total} responded (status: {status})")

        if status == "finished" and not result.get("partial"):
            break
        if status == "finished" and responded >= total:
            break
        if responded == total:
            break
        time.sleep(20)

    # Get final results
    resp = api("GET", f"/v1/jobs/{job_id}")
    results = resp.get("result", {}).get("results", [])
    responded = [r for r in results if r.get("reply")]

    print(f"\nReceived {len(responded)} of {total} responses\n")

    for i, r in enumerate(responded, 1):
        print_result(r, i)

    save_markdown(question, responded)


# ── Paid tier flow ─────────────────────────────────────────────────────

def run_paid(question: str, args):
    print("Using PAID tier (custom personas, demographic filters)")

    # Step 1: Recruit
    group = recruit_group(args)
    group_data = group.get("group", {})
    group_uuid = group_data.get("uuid")
    group_id = group_data.get("id")
    if not group_uuid:
        print("Error: No group UUID returned.", file=sys.stderr)
        print(json.dumps(group, indent=2))
        sys.exit(1)
    print(f"  Group: {group_id} (uuid: {group_uuid})")

    # Step 2: Create study
    study = create_study(group_uuid, question)
    study_data = study.get("study", {})
    study_id = study_data.get("id")
    if not study_id:
        print("Error: No study ID returned.", file=sys.stderr)
        print(json.dumps(study, indent=2))
        sys.exit(1)
    print(f"  Study: {study_id}")

    # Step 3: Ask question
    q_resp = ask_question(study_id, question)
    job_ids = q_resp.get("job_ids", [])
    if not job_ids:
        print("Error: No job_ids returned.", file=sys.stderr)
        print(json.dumps(q_resp, indent=2))
        sys.exit(1)
    print(f"  Jobs: {len(job_ids)}")

    # Step 4: Poll
    results = poll_jobs(job_ids, args.size)
    responded_count = len([r for r in results if r.get("response_text") or r.get("agent_id")])

    # Auto-retry if <80% responded after first attempt
    threshold = int(args.size * 0.8)
    if responded_count < threshold:
        print(f"\nOnly {responded_count}/{args.size} responded. Retrying...")
        q_resp2 = ask_question(study_id, question)
        job_ids2 = q_resp2.get("job_ids", [])
        if job_ids2:
            results2 = poll_jobs(job_ids2, args.size)
            # Merge, deduplicating by agent_id
            seen = {r.get("agent_id") for r in results if r.get("agent_id")}
            for r in results2:
                aid = r.get("agent_id")
                if aid and aid not in seen:
                    results.append(r)
                    seen.add(aid)

    # Fetch full answers from study endpoint for richer data
    answers = get_study_answers(study_id)

    # Step 5: Complete study
    print("Completing study...")
    complete_study(study_id)

    # Step 6: Share link
    share_link = get_share_link(study_id)
    if share_link:
        print(f"Share link: {share_link}")

    # Use answers from study endpoint (richer) if available, else raw poll results
    display = answers if answers else results
    print(f"\nReceived {len(display)} responses\n")

    for i, r in enumerate(display, 1):
        print_result(r, i)

    save_markdown(question, display, share_link)


# ── Main ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Ask Ditto a research question")
    parser.add_argument("question", help="The question to ask")
    parser.add_argument("--age-min", type=int, help="Minimum age filter")
    parser.add_argument("--age-max", type=int, help="Maximum age filter")
    parser.add_argument("--gender", help="Gender filter (male/female)")
    parser.add_argument("--state", help="US state code (e.g. NY, CA)")
    parser.add_argument("--city", help="City name")
    parser.add_argument("--size", type=int, default=10, help="Group size (default: 10)")

    args = parser.parse_args()

    if is_free_tier():
        if any([args.age_min, args.age_max, args.gender, args.state, args.city]):
            print("Warning: Filters are ignored on free tier.", file=sys.stderr)
        run_free(args.question)
    else:
        run_paid(args.question, args)


if __name__ == "__main__":
    main()

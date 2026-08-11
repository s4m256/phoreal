"""Extract and translate a single Taiwan olympiad-training volume.

This importer is intentionally separate from the pho.rs/XY pipeline. It keeps
the original Chinese statement and page references, excludes worked solutions,
and writes static site data that can be reviewed before more volumes are added.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader


API_URL = "https://api.openai.com/v1/responses"
CHINESE_NUMERALS = [
    "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
    "二十一", "二十二", "二十三", "二十四", "二十五", "二十六", "二十七", "二十八", "二十九", "三十", "三十一",
]
HEADING_RE = re.compile(
    rf"(?m)^({'|'.join(sorted(CHINESE_NUMERALS, key=len, reverse=True))})、\s*(.+?)\s*$"
)
HEADER_RE = re.compile(r"^\s*物奧練習題\s+第十冊\s+第\d+頁\s+許芳慈\s*", re.MULTILINE)
SOLUTION_RE = re.compile(r"(?m)^\s*解(?:答)?：\s*$")
INSTRUCTIONS = """Translate this Taiwan physics-olympiad problem from Traditional Chinese into precise, natural Brazilian Portuguese.

Requirements:
- Translate only; never solve, summarize, explain, correct, or add content.
- Preserve every item label, equation number, number, sign, variable, Greek letter, formula, URL, citation, and logical condition.
- Keep mathematical expressions exactly equivalent. Preserve the supplied Unicode mathematical notation instead of guessing new formulas.
- Translate unit words in prose and use standard international SI abbreviations where appropriate, without changing values.
- Preserve the paragraph and line structure needed to distinguish sections and items such as (a), (b), A.1, B.2.
- Use established Brazilian Portuguese terminology for physics.
- Do not add Markdown headings, code fences, commentary, or a solution.
"""
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "title_pt": {"type": "string"},
        "statement_pt": {"type": "string"},
    },
    "required": ["title_pt", "statement_pt"],
    "additionalProperties": False,
}


def response_text(payload: dict) -> str:
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                return content["text"]
    raise RuntimeError("OpenAI response did not contain output_text")


def page_text(reader: PdfReader, index: int) -> str:
    text = reader.pages[index].extract_text() or ""
    text = HEADER_RE.sub("", text).replace("\u3000", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    return text.strip()


def extract_problems(pdf_path: Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    if len(reader.pages) != 100:
        raise RuntimeError(f"Expected 100 pages in Taiwan volume 10, found {len(reader.pages)}")

    chunks = []
    for page_number in range(2, len(reader.pages) + 1):
        chunks.append(f"\nZXQPAGE{page_number:04d}\n{page_text(reader, page_number - 1)}")
    corpus = "\n".join(chunks)
    headings = list(HEADING_RE.finditer(corpus))
    if len(headings) != 31:
        found = [match.group(0) for match in headings]
        raise RuntimeError(f"Expected 31 problem headings, found {len(headings)}: {found}")

    problems: list[dict] = []
    for index, heading in enumerate(headings):
        block_end = headings[index + 1].start() if index + 1 < len(headings) else len(corpus)
        full_body = corpus[heading.end():block_end].strip()
        statement = SOLUTION_RE.split(full_body, maxsplit=1)[0].strip()
        preceding_pages = [int(value) for value in re.findall(r"ZXQPAGE(\d{4})", corpus[:heading.start()])]
        page_start = preceding_pages[-1] if preceding_pages else 2
        statement_pages = [int(value) for value in re.findall(r"ZXQPAGE(\d{4})", statement)]
        page_end = statement_pages[-1] if statement_pages else page_start
        statement = re.sub(r"\n?ZXQPAGE\d{4}\n?", "\n", statement).strip()
        statement = re.sub(r"\n{3,}", "\n\n", statement)
        problems.append({
            "id": index + 1,
            "code": f"TW10-{index + 1:02d}",
            "title_original": heading.group(2).strip(),
            "statement_original": statement,
            "page_start": page_start,
            "page_end": page_end,
            "source_url": f"/taiwan/taiwan-10.pdf#page={page_start}",
        })
    return problems


def translate_one(api_key: str, model: str, problem: dict, timeout: int) -> tuple[dict, dict]:
    user_input = json.dumps(
        {"title": problem["title_original"], "statement": problem["statement_original"]},
        ensure_ascii=False,
    )
    body = {
        "model": model,
        "instructions": INSTRUCTIONS,
        "input": user_input,
        "reasoning": {"effort": "none"},
        "text": {
            "verbosity": "low",
            "format": {
                "type": "json_schema",
                "name": "translated_problem",
                "strict": True,
                "schema": OUTPUT_SCHEMA,
            },
        },
        "store": False,
        "max_output_tokens": 12000,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            result = json.loads(response_text(payload))
            if not result["title_pt"].strip() or not result["statement_pt"].strip():
                raise RuntimeError("Translation returned an empty field")
            return result, payload.get("usage", {})
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, RuntimeError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to translate {problem['code']}: {last_error}")


def translate_problems(problems: list[dict], output_path: Path, model: str, workers: int, timeout: int) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    previous: dict[int, dict] = {}
    if output_path.exists():
        prior_payload = json.loads(output_path.read_text(encoding="utf-8"))
        previous = {int(item["id"]): item for item in prior_payload.get("problems", []) if item.get("title_pt")}

    translated = dict(previous)
    usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    pending = [problem for problem in problems if problem["id"] not in translated]
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {executor.submit(translate_one, api_key, model, problem, timeout): problem for problem in pending}
        for future in as_completed(futures):
            problem = futures[future]
            result, request_usage = future.result()
            translated[problem["id"]] = {**problem, **result}
            for key in usage:
                usage[key] += int(request_usage.get(key, 0) or 0)
            print(json.dumps({"translated": problem["code"], "of": len(problems), "usage": request_usage}, ensure_ascii=False), flush=True)
            write_output(output_path, translated, model, usage)
    return write_output(output_path, translated, model, usage)


def write_output(output_path: Path, translated: dict[int, dict], model: str, usage: dict) -> dict:
    payload = {
        "schema_version": 1,
        "collection": "Taiwan — volume 10",
        "volume": 10,
        "language": "pt-BR",
        "translation_model": model,
        "translated_at": datetime.now(timezone.utc).isoformat(),
        "usage": usage,
        "problems": [translated[key] for key in sorted(translated)],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", default="gpt-5.6-luna")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=240)
    parser.add_argument("--extract-only", action="store_true")
    args = parser.parse_args()

    problems = extract_problems(args.pdf)
    if args.extract_only:
        payload = write_output(args.output, {item["id"]: item for item in problems}, "not-translated", {})
    else:
        payload = translate_problems(problems, args.output, args.model, args.workers, args.timeout)
    if len(payload["problems"]) != 31:
        raise RuntimeError("Output is incomplete")
    print(json.dumps({"status": "ok", "problems": len(payload["problems"]), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Translate one protected pho.rs job with the OpenAI Responses API.

This transport never edits the catalog database. It writes a result artifact
that must still pass ``external-phors-translation.py apply`` and human review.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


API_URL = "https://api.openai.com/v1/responses"
PROSE_INSTRUCTIONS = """Translate the supplied Russian physics-olympiad text into precise, natural Brazilian Portuguese.

Requirements:
- Return only the translated marked text, with no commentary or Markdown fences.
- Preserve every marker exactly once. Keep ZXQNODE/ZXQEND records in order; a ZXQSAFE marker may move only within its own record when Portuguese grammar requires it.
- Translate all prose between markers; do not omit, summarize, solve or explain anything.
- Preserve technical meaning, proper names, notation, units and item references.
- Use standard Brazilian Portuguese terminology for physics and laboratory work.
- Keep each record between its original ZXQNODE and ZXQEND markers.
"""
MATH_INSTRUCTIONS = """Translate only the Cyrillic words, labels, abbreviations and units inside each marked LaTeX expression into precise Brazilian Portuguese or international SI notation.

Requirements:
- Return only the marked expressions, with no commentary or Markdown fences.
- Preserve every ZXQMATH/ZXQMEND marker exactly once and keep the records in order.
- Preserve all LaTeX commands, delimiters, braces, numbers, operators and non-Cyrillic variables exactly.
- Translate every Cyrillic fragment, including text inside \\text{} and symbolic subscripts.
- Use Latin SI units such as m, mm, kg, Hz, kHz, MHz, V, mV and kΩ.
- Use standard concise symbolic subscripts: translate рез as res and анти as anti (for example, f_{рез} becomes f_{res}).
- Do not solve, simplify or rewrite the formulas.
"""
CYRILLIC = re.compile(r"[\u0400-\u04ff]")


def response_text(payload: dict) -> str:
    pieces: list[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                pieces.append(content["text"])
    if not pieces:
        raise RuntimeError("OpenAI response did not contain output_text")
    return "\n".join(pieces).strip()


def translate(api_key: str, model: str, text: str, timeout: int, instructions: str) -> tuple[str, dict]:
    body = {
        "model": model,
        "instructions": instructions,
        "input": text,
        "reasoning": {"effort": "low"},
        "text": {"verbosity": "low"},
        "store": False,
        "max_output_tokens": 12000,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API returned HTTP {error.code}: {detail}") from error
    return response_text(payload), {
        "response_id": payload.get("id"),
        "model": payload.get("model"),
        "usage": payload.get("usage", {}),
    }


def math_values(job: dict) -> list[str]:
    return list(dict.fromkeys(
        value
        for record in job["records"]
        for value in record["protected_values"]
        if CYRILLIC.search(value)
    ))


def make_math_batches(values: list[str], max_chars: int = 4200) -> list[list[tuple[int, str]]]:
    batches: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    length = 0
    for index, value in enumerate(values):
        line = f"ZXQMATH{index:06d}QXZ {value} ZXQMEND{index:06d}QXZ"
        if len(line) > max_chars:
            raise RuntimeError(f"Math expression {index} exceeds {max_chars} characters")
        if current and length + len(line) + 1 > max_chars:
            batches.append(current)
            current = []
            length = 0
        current.append((index, line))
        length += len(line) + (1 if length else 0)
    if current:
        batches.append(current)
    return batches


def parse_math_batch(raw: str, batch: list[tuple[int, str]]) -> dict[int, str]:
    translated: dict[int, str] = {}
    for index, _line in batch:
        matches = re.findall(rf"ZXQMATH{index:06d}QXZ\s*(.*?)\s*ZXQMEND{index:06d}QXZ", raw, re.DOTALL)
        if len(matches) != 1:
            raise RuntimeError(f"Math expression {index}: expected one marked translation, found {len(matches)}")
        translated[index] = matches[0].strip()
    return translated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="gpt-5.6-terra")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    output = Path(args.output)
    previous = json.loads(output.read_text(encoding="utf-8")) if args.resume and output.exists() else {}
    translated_batches: dict[str, str] = dict(previous.get("batches", {}))
    translated_math: dict[str, str] = dict(previous.get("math_translations", {}))
    requests: list[dict] = list(previous.get("requests", []))
    for batch in job["batches"]:
        if str(batch["id"]) in translated_batches:
            continue
        translated, metadata = translate(api_key, args.model, batch["text"], args.timeout, PROSE_INSTRUCTIONS)
        translated_batches[str(batch["id"])] = translated
        requests.append({"kind": "prose", "batch_id": batch["id"], **metadata})
        print(json.dumps({"translated_batch": batch["id"], "of": len(job["batches"]), "usage": metadata["usage"]}, ensure_ascii=False))

    values = math_values(job)
    missing_values = [(index, value) for index, value in enumerate(values) if value not in translated_math]
    if missing_values:
        missing_lookup = {new_index: original_index for new_index, (original_index, _value) in enumerate(missing_values)}
        compact_values = [value for _index, value in missing_values]
        for math_batch_id, batch in enumerate(make_math_batches(compact_values)):
            raw, metadata = translate(api_key, args.model, "\n".join(line for _index, line in batch), args.timeout, MATH_INSTRUCTIONS)
            for compact_index, translated in parse_math_batch(raw, batch).items():
                original_index = missing_lookup[compact_index]
                translated_math[values[original_index]] = translated
            requests.append({"kind": "math", "batch_id": math_batch_id, **metadata})
            print(json.dumps({"translated_math_batch": math_batch_id, "usage": metadata["usage"]}, ensure_ascii=False))

    artifact = {
        "schema_version": 1,
        "engine": f"OpenAI Responses API / {args.model} / reasoning low",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job": str(Path(args.job)),
        "requests": requests,
        "batches": translated_batches,
        "math_translations": translated_math,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "translated_review_required", "batches": len(translated_batches), "output": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Translate only Cyrillic fragments inside math, preserving LaTeX byte structure."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


batch_transport = load_module("phors_batch_transport", "run-openai-phors-batch.py")
translation = load_module("phors_translation_validation", "external-phors-translation.py")
FRAGMENT = re.compile(r"[\u0400-\u04ff]+(?:[ \t]+[\u0400-\u04ff]+)*")
INSTRUCTIONS = """Translate each marked Russian fragment into precise Brazilian Portuguese using its physics-expression context.

Requirements:
- Return only ZXQFRAG... translated replacement ZXQEND for every record, in order. Do not return CONTEXT.
- The replacement must be plain text that can replace only the Russian fragment at the same position in the original LaTeX.
- Do not return LaTeX commands, braces, dollar signs, markers, explanations or line breaks inside a replacement.
- Preserve technical meaning and capitalization where meaningful.
- Use international SI symbols: m, cm, mm, μm, s, ms, μs, kg, g, Hz, kHz, MHz, V, mV, A, Ω, kΩ and similar.
- For symbolic subscripts, translate рез as res and анти as anti.
"""


def math_values(job: dict) -> list[str]:
    return list(dict.fromkeys(
        value
        for record in job["records"]
        for value in record["protected_values"]
        if translation.CYRILLIC.search(value)
    ))


def prepare(args: argparse.Namespace) -> None:
    jobs = sorted(Path(args.jobs_dir).glob("*-job.json"))
    pairs: list[tuple[str, str]] = []
    seen = set()
    for path in jobs:
        job = json.loads(path.read_text(encoding="utf-8"))
        for expression in math_values(job):
            for match in FRAGMENT.finditer(expression):
                pair = (match.group(), expression)
                if pair not in seen:
                    seen.add(pair)
                    pairs.append(pair)
    records = [{"index": index, "source": source, "expression": expression} for index, (source, expression) in enumerate(pairs)]
    batches: list[list[dict]] = []
    current: list[dict] = []
    length = 0
    for record in records:
        line = f"ZXQFRAG{record['index']:06d}QXZ {record['source']}\nCONTEXT: {record['expression']}\nZXQEND{record['index']:06d}QXZ"
        if current and length + len(line) + 1 > args.max_chars:
            batches.append(current)
            current = []
            length = 0
        current.append({**record, "line": line})
        length += len(line) + 1
    if current:
        batches.append(current)
    requests = []
    entries = {}
    for batch_id, records_batch in enumerate(batches):
        custom_id = f"fragments:{batch_id}"
        requests.append({
            "custom_id": custom_id, "method": "POST", "url": "/v1/responses",
            "body": batch_transport.response_body(args.model, INSTRUCTIONS, "\n".join(record["line"] for record in records_batch)),
        })
        entries[custom_id] = {"records": [record["index"] for record in records_batch]}
    request_path = Path(args.request_file)
    request_path.parent.mkdir(parents=True, exist_ok=True)
    request_path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in requests), encoding="utf-8")
    manifest = {
        "schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(), "model": args.model,
        "jobs": [str(path) for path in jobs], "records": records, "entries": entries,
    }
    Path(args.manifest).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "prepared", "fragments": len(records), "requests": len(requests), "requestBytes": request_path.stat().st_size}, indent=2))


def collect(args: argparse.Namespace) -> None:
    state_path = Path(args.state)
    state, batch = batch_transport.get_batch(state_path)
    if batch["status"] != "completed":
        raise RuntimeError(f"Batch is {batch['status']}, not completed")
    raw = batch_transport.download_file(batch["output_file_id"], batch_transport.api_key())
    Path(args.output_jsonl).write_bytes(raw)
    manifest = json.loads(Path(state["manifest"]).read_text(encoding="utf-8"))
    records = {record["index"]: record for record in manifest["records"]}
    replacements: dict[tuple[str, str], str] = {}
    for line in raw.decode("utf-8").splitlines():
        item = json.loads(line)
        response = item.get("response")
        if item.get("error") or not response or response.get("status_code") != 200:
            raise RuntimeError(f"Fragment request failed: {item['custom_id']}")
        text = batch_transport.transport.response_text(response["body"])
        for index in manifest["entries"][item["custom_id"]]["records"]:
            matches = re.findall(rf"ZXQFRAG{index:06d}QXZ\s*(.*?)\s*ZXQEND{index:06d}QXZ", text, re.DOTALL)
            if len(matches) != 1:
                raise RuntimeError(f"Fragment {index}: expected one marked result, found {len(matches)}")
            value = matches[0].strip()
            if not value or translation.CYRILLIC.search(value) or any(character in value for character in "\\{}$\n\r") or "ZXQ" in value or "CONTEXT" in value:
                raise RuntimeError(f"Fragment {index}: unsafe replacement {value!r}")
            record = records[index]
            replacements[(record["source"], record["expression"])] = value
    results_dir = Path(args.results_dir)
    safe_dir = Path(args.safe_results_dir)
    safe_dir.mkdir(parents=True, exist_ok=True)
    for job_path in manifest["jobs"]:
        job = json.loads(Path(job_path).read_text(encoding="utf-8"))
        name = Path(job_path).name.replace("-job.json", "-result.json")
        result = json.loads((results_dir / name).read_text(encoding="utf-8"))
        safe_math = {}
        for expression in math_values(job):
            safe_math[expression] = FRAGMENT.sub(lambda match: replacements[(match.group(), expression)], expression)
            translation.validate_math_translation(expression, safe_math[expression])
        result["math_translations"] = safe_math
        result["engine"] += " + structure-preserving fragment math pass"
        (safe_dir / name).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "collected", "fragments": len(replacements), "safeResults": len(manifest["jobs"]), "usage": batch.get("usage")}, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--jobs-dir", required=True)
    prepare_parser.add_argument("--request-file", required=True)
    prepare_parser.add_argument("--manifest", required=True)
    prepare_parser.add_argument("--model", default="gpt-5.6-terra")
    prepare_parser.add_argument("--max-chars", type=int, default=4200)
    prepare_parser.set_defaults(run=prepare)
    collect_parser = subparsers.add_parser("collect")
    collect_parser.add_argument("--state", required=True)
    collect_parser.add_argument("--output-jsonl", required=True)
    collect_parser.add_argument("--results-dir", required=True)
    collect_parser.add_argument("--safe-results-dir", required=True)
    collect_parser.set_defaults(run=collect)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()

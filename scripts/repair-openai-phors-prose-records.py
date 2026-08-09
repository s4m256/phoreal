"""Retry specific malformed prose records one at a time and merge them safely."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
from pathlib import Path


spec = importlib.util.spec_from_file_location("phors_translation_transport", Path(__file__).with_name("run-openai-phors-translation.py"))
transport = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(transport)

INSTRUCTIONS = """Translate the single marked Russian physics-olympiad record into precise Brazilian Portuguese.

Return exactly one ZXQNODE...ZXQEND record and nothing else.
Every ZXQSAFE token represents mandatory source content. Copy every ZXQSAFE token exactly once, even if it appears redundant or awkward. Never omit, rename, duplicate, reorder, interpret or replace a ZXQSAFE token.
Translate all Russian prose without summarizing, solving or explaining. Preserve technical meaning and natural Brazilian Portuguese word order around the mandatory tokens.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--keys", nargs="+", required=True)
    parser.add_argument("--literal")
    parser.add_argument("--model", default="gpt-5.6-terra")
    args = parser.parse_args()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key and not args.literal:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    result_path = Path(args.result)
    result = json.loads(result_path.read_text(encoding="utf-8"))
    by_key = {record["key"]: record for record in job["records"]}
    batch_by_record = {index: batch for batch in job["batches"] for index in batch["records"]}
    repaired = []
    for key in args.keys:
        record = by_key[key]
        index = record["index"]
        line = f"ZXQNODE{index:06d}QXZ {record['protected']} ZXQEND{index:06d}QXZ"
        translated, metadata = (args.literal, {"model": "deterministic literal repair", "usage": {}}) if args.literal else transport.translate(api_key, args.model, line, 180, INSTRUCTIONS)
        outer = re.findall(rf"ZXQNODE{index:06d}QXZ\s*(.*?)\s*ZXQEND{index:06d}QXZ", translated, re.DOTALL)
        if len(outer) != 1:
            raise RuntimeError(f"{key}: invalid outer markers")
        expected = [f"ZXQSAFE{value_index:06d}QXZ" for value_index in range(len(record["protected_values"]))]
        found = re.findall(r"ZXQSAFE\d{6}QXZ", outer[0])
        if sorted(found) != expected:
            raise RuntimeError(f"{key}: protected markers still invalid: {found}")
        batch = batch_by_record[index]
        batch_key = str(batch["id"])
        raw = result["batches"][batch_key]
        pattern = re.compile(rf"ZXQNODE{index:06d}QXZ\s*.*?\s*ZXQEND{index:06d}QXZ", re.DOTALL)
        replacement = f"ZXQNODE{index:06d}QXZ {outer[0].strip()} ZXQEND{index:06d}QXZ"
        raw, count = pattern.subn(lambda _match: replacement, raw, count=1)
        if count != 1:
            raise RuntimeError(f"{key}: could not merge repaired record")
        result["batches"][batch_key] = raw
        result.setdefault("requests", []).append({"kind": "prose_record_repair", "key": key, **metadata})
        repaired.append(key)
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "repaired", "records": repaired, "result": str(result_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

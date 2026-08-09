"""Prepare and apply structurally protected translations for one XY exam.

The transport is deliberately separate from this script. ``prepare`` creates
small batches whose opaque markers can be sent to a translation service.
``apply`` accepts the returned text, verifies every marker, restores protected
content and writes only draft translations to the local catalog database.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


TAG_OR_TEXT = re.compile(r"(<[^>]+>|[^<]+)", re.DOTALL)
TAG_NAME = re.compile(r"</?\s*([a-zA-Z0-9]+)")
CLASS_NAME = re.compile(r'\bclass\s*=\s*(["\'])(.*?)\1', re.DOTALL)
CYRILLIC = re.compile(r"[А-Яа-яЁё]")
MATH = re.compile(r"(\$\$.*?\$\$|(?<!\$)\$(?!\$).*?(?<!\$)\$(?!\$)|\\\[.*?\\\]|\\\(.*?\\\))", re.DOTALL)
PROTECTED_VALUE = re.compile(
    r"(https?://\S+|[+-]?\d+(?:[.,]\d+)*(?:\s*[·×x]\s*10(?:\^\{?[+-]?\d+\}?)?)?|\b(?:[A-Z]{1,4}\d+(?:\.\d+)*|X24|PE)\b)"
)
NODE_OPEN = re.compile(r"ZXQNODE(\d{6})QXZ")
TEX_COMMAND = re.compile(r"\\[A-Za-z]+")
NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def protect(source: str) -> tuple[str, list[str]]:
    values: list[str] = []

    def replace_math(match: re.Match[str]) -> str:
        values.append(match.group(0))
        return f"ZXQSAFE{len(values) - 1:06d}QXZ"

    protected = MATH.sub(replace_math, source)

    def replace_value(match: re.Match[str]) -> str:
        values.append(match.group(0))
        return f"ZXQSAFE{len(values) - 1:06d}QXZ"

    protected = "".join(
        piece if re.fullmatch(r"ZXQSAFE\d{6}QXZ", piece) else PROTECTED_VALUE.sub(replace_value, piece)
        for piece in re.split(r"(ZXQSAFE\d{6}QXZ)", protected)
    )
    return protected, values


def restore(translated: str, values: list[str], key: str) -> str:
    expected = [f"ZXQSAFE{index:06d}QXZ" for index in range(len(values))]
    found = re.findall(r"ZXQSAFE\d{6}QXZ", translated)
    if sorted(found) != expected:
        raise RuntimeError(f"{key}: protected values missing, duplicated or changed: expected {expected}, found {found}")
    for index, value in enumerate(values):
        translated = translated.replace(f"ZXQSAFE{index:06d}QXZ", value)
    return translated


def math_delimiter(value: str) -> str:
    stripped = value.strip()
    if stripped.startswith("$$") and stripped.endswith("$$"):
        return "$$"
    if stripped.startswith("$") and stripped.endswith("$"):
        return "$"
    if stripped.startswith("\\[") and stripped.endswith("\\]"):
        return "\\[]"
    if stripped.startswith("\\(") and stripped.endswith("\\)"):
        return "\\()"
    return ""


def validate_math_translation(source: str, translated: str) -> None:
    if CYRILLIC.search(translated):
        raise RuntimeError(f"Translated math still contains Cyrillic: {translated}")
    if math_delimiter(source) != math_delimiter(translated):
        raise RuntimeError(f"Math delimiters changed: {source} -> {translated}")
    if TEX_COMMAND.findall(source) != TEX_COMMAND.findall(translated):
        raise RuntimeError(f"TeX commands changed: {source} -> {translated}")
    if NUMBER.findall(source) != NUMBER.findall(translated):
        raise RuntimeError(f"Numbers changed in math: {source} -> {translated}")
    for character in "{}[]()":
        if source.count(character) != translated.count(character):
            raise RuntimeError(f"Math grouping changed for {character}: {source} -> {translated}")


def canonicalize_math_translation(source: str, translated: str) -> str:
    if "рез" in source:
        translated = translated.replace("{ress}", "{res}")
    return translated


def translatable_html_nodes(source_html: str) -> list[tuple[int, str]]:
    nodes: list[tuple[int, str]] = []
    skip_stack: list[bool] = []
    text_index = 0
    for token in TAG_OR_TEXT.findall(source_html):
        if token.startswith("<"):
            match = TAG_NAME.match(token)
            if not match or token.startswith("<!"):
                continue
            name = match.group(1).lower()
            if token.startswith("</"):
                if skip_stack:
                    skip_stack.pop()
                continue
            classes = CLASS_NAME.search(token)
            inherited_skip = skip_stack[-1] if skip_stack else False
            own_skip = name in {"sup", "sub"} or bool(classes and "statement-part-label" in classes.group(2).split())
            if not token.rstrip().endswith("/>") and name not in {"br", "hr", "img", "meta", "link", "input"}:
                skip_stack.append(inherited_skip or own_skip)
            continue
        if CYRILLIC.search(html.unescape(token)) and not (skip_stack and skip_stack[-1]):
            nodes.append((text_index, html.unescape(token)))
        text_index += 1
    return nodes


def make_records(connection: sqlite3.Connection, exam_code: str, codes: set[str] | None) -> tuple[list[dict], list[sqlite3.Row]]:
    problems = connection.execute(
        """
        SELECT p.* FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id
        WHERE e.code=? ORDER BY CASE WHEN p.code LIKE 'T%' THEN 0 ELSE 1 END,p.code
        """,
        (exam_code,),
    ).fetchall()
    if codes:
        problems = [problem for problem in problems if problem["code"] in codes]
    if not problems:
        raise RuntimeError(f"No problems found for {exam_code}")

    records: list[dict] = []

    def add(key: str, entity: str, entity_id: int, source: str) -> None:
        if not source or not CYRILLIC.search(source):
            return
        protected, values = protect(source)
        records.append({
            "index": len(records),
            "key": key,
            "entity": entity,
            "entity_id": entity_id,
            "source": source,
            "protected": protected,
            "protected_values": values,
        })

    for problem in problems:
        add(f"problem-title:{problem['id']}", "problem_title", problem["id"], problem["title"] or "")
        for text_index, source in translatable_html_nodes(problem["statement_html_original"] or ""):
            add(f"statement:{problem['id']}:{text_index}", "statement_node", problem["id"], source)
        parts = connection.execute(
            "SELECT id,prompt_text FROM phors_problem_parts WHERE problem_id=? ORDER BY ordinal", (problem["id"],)
        ).fetchall()
        for part in parts:
            add(f"part:{part['id']}", "part", part["id"], part["prompt_text"] or "")

    problem_ids = [problem["id"] for problem in problems]
    placeholders = ",".join("?" for _ in problem_ids)
    tags = connection.execute(
        f"""
        SELECT DISTINCT t.id,t.name FROM phors_tags t
        JOIN phors_problem_tags pt ON pt.tag_id=t.id
        WHERE pt.problem_id IN ({placeholders}) ORDER BY t.id
        """,
        problem_ids,
    ).fetchall()
    for tag in tags:
        add(f"tag:{tag['id']}", "tag", tag["id"], tag["name"])
    return records, problems


def make_batches(records: list[dict], max_chars: int) -> list[dict]:
    batches: list[dict] = []
    current: list[dict] = []
    current_length = 0
    for record in records:
        line = f"ZXQNODE{record['index']:06d}QXZ {record['protected']} ZXQEND{record['index']:06d}QXZ"
        if len(line) > max_chars:
            raise RuntimeError(f"{record['key']}: one translation unit exceeds {max_chars} characters")
        if current and current_length + len(line) + 1 > max_chars:
            batches.append({"id": len(batches), "records": [item["index"] for item in current], "text": "\n".join(item["line"] for item in current)})
            current = []
            current_length = 0
        current.append({"index": record["index"], "line": line})
        current_length += len(line) + (1 if current_length else 0)
    if current:
        batches.append({"id": len(batches), "records": [item["index"] for item in current], "text": "\n".join(item["line"] for item in current)})
    return batches


def prepare(args: argparse.Namespace) -> None:
    connection = sqlite3.connect(args.db)
    connection.row_factory = sqlite3.Row
    records, problems = make_records(connection, args.exam, set(args.codes) if args.codes else None)
    batches = make_batches(records, args.max_chars)
    artifact = {
        "schema_version": 1,
        "exam": args.exam,
        "locale": "pt-BR",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "problem_codes": [problem["code"] for problem in problems],
        "source_hashes": {str(problem["id"]): problem["statement_content_hash"] for problem in problems},
        "records": records,
        "batches": batches,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"exam": args.exam, "problems": len(problems), "records": len(records), "batches": len(batches), "output": str(output)}, ensure_ascii=False))
    connection.close()


def parse_results(job: dict, result: dict) -> dict[str, str]:
    translated: dict[str, str] = {}
    records_by_index = {record["index"]: record for record in job["records"]}
    required_math = {
        value
        for record in job["records"]
        for value in record["protected_values"]
        if CYRILLIC.search(value)
    }
    math_translations = {
        source: canonicalize_math_translation(source, translated)
        for source, translated in result.get("math_translations", {}).items()
    }
    if set(math_translations) != required_math:
        raise RuntimeError("Math translations do not exactly cover the protected Cyrillic expressions")
    for source, translated_math in math_translations.items():
        validate_math_translation(source, translated_math)
    for batch in job["batches"]:
        raw = result.get("batches", {}).get(str(batch["id"]))
        if not raw:
            raise RuntimeError(f"Missing translated batch {batch['id']}")
        for index in batch["records"]:
            pattern = re.compile(rf"ZXQNODE{index:06d}QXZ\s*(.*?)\s*ZXQEND{index:06d}QXZ", re.DOTALL)
            matches = pattern.findall(raw)
            if len(matches) != 1:
                raise RuntimeError(f"Batch {batch['id']}, record {index}: expected one marked translation, found {len(matches)}")
            record = records_by_index[index]
            value = restore(matches[0].strip(), record["protected_values"], record["key"])
            for source_math, translated_math in math_translations.items():
                value = value.replace(source_math, translated_math)
            translated[record["key"]] = value
    if len(translated) != len(job["records"]):
        raise RuntimeError(f"Expected {len(job['records'])} translations, found {len(translated)}")
    return translated


def rebuild_html(source_html: str, problem_id: int, translated: dict[str, str]) -> str:
    output: list[str] = []
    text_index = 0
    for token in TAG_OR_TEXT.findall(source_html):
        if token.startswith("<"):
            output.append(token)
            continue
        key = f"statement:{problem_id}:{text_index}"
        if key in translated:
            output.append(html.escape(translated[key], quote=False).replace("'", "&#x27;"))
        else:
            output.append(token)
        text_index += 1
    return "".join(output)


def apply(args: argparse.Namespace) -> None:
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    result = json.loads(Path(args.result).read_text(encoding="utf-8"))
    translated = parse_results(job, result)
    connection = sqlite3.connect(args.db)
    connection.row_factory = sqlite3.Row
    problems = connection.execute(
        "SELECT p.* FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id WHERE e.code=?", (job["exam"],)
    ).fetchall()
    problem_by_id = {problem["id"]: problem for problem in problems}
    selected_ids = {int(problem_id) for problem_id in job["source_hashes"]}
    for problem_id in selected_ids:
        problem = problem_by_id[problem_id]
        expected_hash = job["source_hashes"][str(problem_id)]
        if problem["statement_content_hash"] != expected_hash:
            raise RuntimeError(f"{problem['code']}: source changed after translation job was prepared")
        translated_html = rebuild_html(problem["statement_html_original"], problem_id, translated)
        connection.execute(
            """
            UPDATE phors_problems SET title_pt=?,statement_html_pt=?,translation_status='draft',
              translation_source_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?
            """,
            (translated.get(f"problem-title:{problem_id}", problem["title_pt"]), translated_html, expected_hash, problem_id),
        )
    for record in job["records"]:
        value = translated[record["key"]]
        if record["entity"] == "part":
            connection.execute("UPDATE phors_problem_parts SET prompt_text_pt=? WHERE id=?", (value, record["entity_id"]))
        elif record["entity"] == "tag":
            connection.execute("UPDATE phors_tags SET name_pt=? WHERE id=?", (value, record["entity_id"]))
    connection.commit()

    export = {
        "schema_version": 1,
        "exam": job["exam"],
        "locale": "pt-BR",
        "status": "external_draft_review_required",
        "engine": result.get("engine", "external translation service"),
        "translated_at": datetime.now(timezone.utc).isoformat(),
        "source_job_sha256": hashlib.sha256(Path(args.job).read_bytes()).hexdigest(),
        "problem_codes": job["problem_codes"],
        "translations": translated,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(export, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": export["status"], "exam": job["exam"], "problems": len(selected_ids), "translations": len(translated), "output": str(output)}, ensure_ascii=False))
    connection.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--db", default="data/phors-full.sqlite")
    prepare_parser.add_argument("--exam", default="X24")
    prepare_parser.add_argument("--codes", nargs="*")
    prepare_parser.add_argument("--max-chars", type=int, default=4200)
    prepare_parser.add_argument("--output", default="work/x24-external-translation/job.json")
    prepare_parser.set_defaults(run=prepare)
    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("--db", default="data/phors-full.sqlite")
    apply_parser.add_argument("--job", default="work/x24-external-translation/job.json")
    apply_parser.add_argument("--result", default="work/x24-external-translation/result.json")
    apply_parser.add_argument("--output", default="data/translations/x24-external-draft.json")
    apply_parser.set_defaults(run=apply)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()

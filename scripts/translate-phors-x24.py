"""Generate a structurally faithful pt-BR draft for the X24 catalog entries.

This is an offline build-time tool. It never runs in the website and never
overwrites Russian source fields.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import argostranslate.translate


TAG_OR_TEXT = re.compile(r"(<[^>]+>|[^<]+)", re.DOTALL)
TAG_NAME = re.compile(r"</?\s*([a-zA-Z0-9]+)")
CLASS_NAME = re.compile(r'\bclass\s*=\s*(["\'])(.*?)\1', re.DOTALL)
MATH = re.compile(r"(\$\$.*?\$\$|(?<!\$)\$(?!\$).*?(?<!\$)\$(?!\$)|\\\[.*?\\\]|\\\(.*?\\\))", re.DOTALL)
PROTECTED = re.compile(
    r"(" 
    r"ARGOSMATHBLOCK\d{6}TOKEN"
    r"|"
    r"[+-]?\d+(?:[.,]\d+)*(?:\s*(?:·|×|x)\s*10(?:\^\{?[+-]?\d+\}?)?)?"
    r"|\b(?:[A-Z]{1,4}\d+(?:\.\d+)*|X24|PE)\b"
    r"|https?://\S+"
    r")"
)
CYRILLIC = re.compile(r"[А-Яа-яЁё]")
GENERATED_NUMBER = re.compile(r"[+-]?\d+(?:[.,]\d+)*")
SMALL_NUMBERS_PT = {
    "0": "zero", "1": "um", "2": "dois", "3": "três", "4": "quatro",
    "5": "cinco", "6": "seis", "7": "sete", "8": "oito", "9": "nove",
    "10": "dez", "11": "onze", "12": "doze", "13": "treze", "14": "quatorze",
    "15": "quinze", "16": "dezesseis", "17": "dezessete", "18": "dezoito",
    "19": "dezenove", "20": "vinte",
}


def spell_generated_number(match: re.Match[str]) -> str:
    value = match.group(0)
    sign = "menos " if value.startswith("-") else ""
    unsigned = value.lstrip("+-")
    if unsigned in SMALL_NUMBERS_PT:
        return sign + SMALL_NUMBERS_PT[unsigned]
    groups = re.split(r"([.,])", unsigned)
    words: list[str] = []
    for group in groups:
        if group in {".", ","}:
            words.append(" vírgula ")
        else:
            words.append(" ".join(SMALL_NUMBERS_PT[digit] for digit in group))
    return sign + "".join(words)


class Translator:
    def __init__(self) -> None:
        self.cache: dict[str, str] = {}

    def plain(self, source: str) -> str:
        if not CYRILLIC.search(source):
            return source
        if source in self.cache:
            return self.cache[source]
        pieces: list[str] = []
        for piece in PROTECTED.split(source):
            if not piece or PROTECTED.fullmatch(piece) or not CYRILLIC.search(piece):
                pieces.append(piece)
            else:
                generated = argostranslate.translate.translate(piece, "ru", "pb")
                generated = GENERATED_NUMBER.sub(spell_generated_number, generated)
                generated = re.sub(r"\bArroz\.", "Figura ", generated)
                pieces.append(generated)
        translated = "".join(pieces)
        self.cache[source] = translated
        return translated

    def text(self, source: str) -> str:
        return "".join(part if MATH.fullmatch(part) else self.plain(part) for part in MATH.split(source))

    def html(self, source_html: str) -> str:
        math_blocks: list[str] = []

        def protect_math(match: re.Match[str]) -> str:
            index = len(math_blocks)
            math_blocks.append(match.group(0))
            return f"ARGOSMATHBLOCK{index:06d}TOKEN"

        protected_html = MATH.sub(protect_math, source_html)
        output: list[str] = []
        skip_stack: list[bool] = []
        for token in TAG_OR_TEXT.findall(protected_html):
            if token.startswith("<"):
                output.append(token)
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
                if not token.rstrip().endswith("/>") and name not in {"br", "hr", "img"}:
                    skip_stack.append(inherited_skip or own_skip)
                continue
            if not token.strip() or (skip_stack and skip_stack[-1]):
                output.append(token)
                continue
            decoded = html.unescape(token)
            translated = self.text(decoded)
            output.append(html.escape(translated, quote=False).replace("'", "&#x27;"))
        translated_html = "".join(output)
        for index, math_block in enumerate(math_blocks):
            translated_html = translated_html.replace(f"ARGOSMATHBLOCK{index:06d}TOKEN", math_block)
        return translated_html


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="data/phors-full.sqlite")
    parser.add_argument("--output", default="data/translations/x24-draft.json")
    parser.add_argument("--codes", nargs="*", help="Translate only these X24 problem codes")
    parser.add_argument("--force", action="store_true", help="Regenerate current drafts")
    parser.add_argument("--translate-tags", action="store_true", help="Also translate X24 tag names")
    args = parser.parse_args()

    connection = sqlite3.connect(args.db)
    connection.row_factory = sqlite3.Row
    translator = Translator()
    all_problems = connection.execute(
        """
        SELECT p.* FROM phors_problems p
        JOIN phors_exams e ON e.id=p.exam_id
        WHERE e.code='X24'
        ORDER BY CASE WHEN p.code LIKE 'T%' THEN 0 ELSE 1 END, p.code
        """
    ).fetchall()
    if len(all_problems) != 9:
        raise RuntimeError(f"Expected 9 X24 problems, found {len(all_problems)}")

    known_codes = {problem["code"] for problem in all_problems}
    requested_codes = set(args.codes or known_codes)
    unknown_codes = requested_codes - known_codes
    if unknown_codes:
        raise RuntimeError(f"Unknown X24 codes: {', '.join(sorted(unknown_codes))}")
    problems = [problem for problem in all_problems if problem["code"] in requested_codes]

    translated_at = datetime.now(timezone.utc).isoformat()
    for index, problem in enumerate(problems, 1):
        if not problem["statement_html_original"] or not problem["statement_content_hash"]:
            raise RuntimeError(f"{problem['code']}: original statement is incomplete")
        if (
            not args.force
            and problem["translation_status"] == "draft"
            and problem["translation_source_hash"] == problem["statement_content_hash"]
            and problem["statement_html_pt"]
        ):
            print(f"X24 {problem['code']}: rascunho atual; ignorado ({index}/{len(problems)})", flush=True)
            continue
        try:
            title_pt = translator.text(problem["title"])
            statement_pt = translator.html(problem["statement_html_original"])
            connection.execute(
                """
                UPDATE phors_problems
                SET title_pt=?, statement_html_pt=?, translation_status='draft',
                    translation_source_hash=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
                """,
                (title_pt, statement_pt, problem["statement_content_hash"], problem["id"]),
            )
            parts = connection.execute(
                "SELECT id,source_key,code,prompt_text FROM phors_problem_parts WHERE problem_id=? ORDER BY ordinal",
                (problem["id"],),
            ).fetchall()
            translated_parts = []
            for part in parts:
                prompt_pt = translator.text(part["prompt_text"]) if part["prompt_text"] else None
                connection.execute("UPDATE phors_problem_parts SET prompt_text_pt=? WHERE id=?", (prompt_pt, part["id"]))
                translated_parts.append({"source_key": part["source_key"], "code": part["code"], "prompt_text_pt": prompt_pt})
            connection.commit()
            print(f"X24 {problem['code']}: traduzido ({index}/{len(problems)})", flush=True)
        except Exception:
            connection.rollback()
            raise

    if args.translate_tags:
        tags = connection.execute(
            """
            SELECT DISTINCT t.id,t.name FROM phors_tags t
            JOIN phors_problem_tags pt ON pt.tag_id=t.id
            JOIN phors_problems p ON p.id=pt.problem_id
            JOIN phors_exams e ON e.id=p.exam_id WHERE e.code='X24'
            """
        ).fetchall()
        translated_tags = []
        for tag in tags:
            name_pt = translator.text(tag["name"])
            connection.execute("UPDATE phors_tags SET name_pt=? WHERE id=?", (name_pt, tag["id"]))
            translated_tags.append({"name_original": tag["name"], "name_pt": name_pt})
        connection.commit()

    connection.execute("UPDATE phors_exams SET title_pt=? WHERE code='X24'", ("Seleção classificatória X24",))
    connection.commit()

    current_problems = connection.execute(
        """
        SELECT p.* FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id
        WHERE e.code='X24' ORDER BY p.code
        """
    ).fetchall()
    records: list[dict] = []
    for problem in current_problems:
        if not problem["statement_html_pt"]:
            continue
        parts = connection.execute(
            "SELECT source_key,code,prompt_text_pt FROM phors_problem_parts WHERE problem_id=? ORDER BY ordinal",
            (problem["id"],),
        ).fetchall()
        records.append({
            "source_id": problem["source_id"],
            "code": problem["code"],
            "title_original": problem["title"],
            "title_pt": problem["title_pt"],
            "source_hash": problem["statement_content_hash"],
            "translation_hash": hashlib.sha256(problem["statement_html_pt"].encode("utf-8")).hexdigest(),
            "statement_html_pt": problem["statement_html_pt"],
            "parts": [dict(part) for part in parts],
        })
    translated_tags = [dict(tag) for tag in connection.execute(
        """
        SELECT DISTINCT t.name name_original,t.name_pt FROM phors_tags t
        JOIN phors_problem_tags pt ON pt.tag_id=t.id
        JOIN phors_problems p ON p.id=pt.problem_id
        JOIN phors_exams e ON e.id=p.exam_id WHERE e.code='X24'
        ORDER BY t.name
        """
    ).fetchall()]

    artifact = {
        "schema_version": 1,
        "exam": "X24",
        "locale": "pt-BR",
        "status": "draft_complete" if len(records) == 9 else "draft_partial",
        "engine": "Argos Translate 1.11.0; ru→en 1.9; en→pb 1.9",
        "translated_at": translated_at,
        "problems": records,
        "tags": translated_tags,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    connection.close()


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
from pathlib import Path

import pymupdf


EXERCISE_BLOCK_RE = re.compile(
    r'%<exercise\s+id="(\d+)"[^>]*>(.*?)%</exercise>', re.S
)
STATEMENT_RE = re.compile(r"%<statement>(.*?)%</statement>", re.S)
SOLUTION_RE = re.compile(r"%<solution>(.*?)%</solution>", re.S)
QUESTION_ITEM_RE = re.compile(
    r"\\begin\{questionitem\}\{([^}]*)\}\{([^}]*)\}(.*?)\\end\{questionitem\}",
    re.S,
)
SOLUTION_ITEM_RE = re.compile(
    r"\\begin\{solutionitem\}\{([^}]*)\}\{([^}]*)\}(.*?)\\end\{solutionitem\}",
    re.S,
)
LIST_RE = re.compile(r"\\begin\{(itemize|enumerate)\}(.*?)\\end\{\1\}", re.S)
TABULAR_RE = re.compile(r"\\begin\{tabular\}\{[^}]*\}(.*?)\\end\{tabular\}", re.S)
SUMMARY_RE = re.compile(r"(?m)^\s*(\d+)\.\s+(.+?)\s+\.{2,}\s*(\d+)\\par\s*$")
ITEM_MARKER_RE = re.compile(r'%<item\s+id="([^"]+)">\s*\\begin\{questionitem\}\{([^}]*)\}', re.S)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def strip_comments(value: str) -> str:
    return re.sub(r"(?<!\\)%.*", "", value)


def parse_group(value: str, start: int) -> tuple[str, int]:
    if start >= len(value) or value[start] != "{":
        raise ValueError(f"Expected group at offset {start}")
    depth = 1
    cursor = start + 1
    while cursor < len(value) and depth:
        if value[cursor] == "{" and value[cursor - 1] != "\\":
            depth += 1
        elif value[cursor] == "}" and value[cursor - 1] != "\\":
            depth -= 1
        cursor += 1
    if depth:
        raise ValueError(f"Unclosed group at offset {start}")
    return value[start + 1 : cursor - 1], cursor


def command_arguments(value: str, command_start: int, name: str, count: int) -> tuple[list[str], int]:
    cursor = command_start + len(name) + 1
    arguments: list[str] = []
    for _ in range(count):
        while cursor < len(value) and value[cursor].isspace():
            cursor += 1
        argument, cursor = parse_group(value, cursor)
        arguments.append(argument)
    return arguments, cursor


def replace_command(value: str, name: str, count: int, callback) -> str:
    marker = f"\\{name}"
    cursor = 0
    output: list[str] = []
    while True:
        start = value.find(marker, cursor)
        if start < 0:
            output.append(value[cursor:])
            return "".join(output)
        after = start + len(marker)
        if after < len(value) and value[after].isalpha():
            output.append(value[cursor:after])
            cursor = after
            continue
        output.append(value[cursor:start])
        try:
            arguments, end = command_arguments(value, start, name, count)
        except ValueError:
            output.append(marker)
            cursor = after
            continue
        output.append(callback(arguments))
        cursor = end


def protect_math(value: str) -> tuple[str, list[str]]:
    tokens: list[str] = []
    pattern = re.compile(
        r"(\\\[.*?\\\]|\\\(.*?\\\)|\$\$.*?\$\$|(?<!\\)\$(?!\$).*?(?<!\\)\$|"
        r"\\begin\{(equation\*?|align\*?|gather\*?)\}.*?\\end\{\2\})",
        re.S,
    )

    def hold(match: re.Match[str]) -> str:
        tokens.append(match.group(0))
        return f"@@MATH{len(tokens) - 1}@@"

    return pattern.sub(hold, value), tokens


def restore(value: str, prefix: str, tokens: list[str]) -> str:
    for index, token in enumerate(tokens):
        value = value.replace(f"@@{prefix}{index}@@", token)
    return value


def replace_simple_command(value: str, command: str, opening: str, closing: str) -> str:
    return replace_command(value, command, 1, lambda args: f"{opening}{args[0]}{closing}")


def clean_title(value: str) -> str:
    value = value.replace("--", "—").replace("``", '“').replace("''", '”')
    value = re.sub(r"\\(?:textbf|textit|emph)\{([^}]*)\}", r"\1", value)
    value = re.sub(r"\\[A-Za-z]+", "", value)
    value = value.replace("{", "").replace("}", "").strip()
    if value.isupper():
        value = value.lower().title()
    replacements = {
        "Iphoc": "IPhOC", "Ipho": "IPhO", "Lrl": "LRL", "Cmb": "CMB",
        "Poynting--Robertson": "Poynting—Robertson", "Aharonov-Casher": "Aharonov-Casher",
        "Rayleigh-Bénard": "Rayleigh-Bénard", "Feynman": "Feynman",
    }
    for before, after in replacements.items():
        value = value.replace(before, after)
    return value


def score_value(value: str) -> float | None:
    match = re.search(r"\d+(?:[.,]\d+)?", value)
    return float(match.group(0).replace(",", ".")) if match else None


def prompt_text(value: str) -> str:
    value, math = protect_math(value)
    value = re.sub(r"\\(?:textbf|textit|emph)\{([^}]*)\}", r"\1", value)
    value = re.sub(r"\\(?:par|noindent|centering|hfill|quad|qquad)\b", " ", value)
    value = re.sub(r"\\(?:begin|end)\{[^}]+\}(?:\{[^}]*\})?", " ", value)
    value = re.sub(r"\\[A-Za-z]+", " ", value)
    value = value.replace("{", "").replace("}", "")
    value = re.sub(r"\s+", " ", value).strip()
    return restore(value, "MATH", math)


def disambiguate_item_codes(statement: str) -> str:
    matches = list(ITEM_MARKER_RE.finditer(statement))
    counts: dict[str, int] = {}
    replacements: list[tuple[int, int, str]] = []
    for match in matches:
        semantic_id, label = match.groups()
        normalized = label.strip().casefold()
        counts[normalized] = counts.get(normalized, 0) + 1
        if counts[normalized] == 1:
            continue
        suffix = semantic_id.rsplit(".", 1)[-1].upper()
        replacements.append((match.start(2), match.end(2), f"{suffix} {label.strip()}"))
    for start, end, replacement in reversed(replacements):
        statement = statement[:start] + replacement + statement[end:]
    return statement


class Converter:
    def __init__(self, pdf: pymupdf.Document, images: Path, volume: int, problem: int):
        self.pdf = pdf
        self.images = images
        self.volume = volume
        self.problem = problem
        self.figure = 0
        self.blocks: list[str] = []

    def block(self, value: str) -> str:
        self.blocks.append(value)
        return f"@@BLOCK{len(self.blocks) - 1}@@"

    def figure_html(self, arguments: list[str], caption: str | None) -> str:
        page_number = int(arguments[0])
        left, bottom, right, top = map(float, arguments[1:5])
        page = self.pdf[page_number - 1]
        bounds = page.rect
        clip = pymupdf.Rect(left, top, bounds.width - right, bounds.height - bottom) & bounds
        if clip.is_empty or clip.width < 2 or clip.height < 2:
            raise ValueError(
                f"Invalid crop in volume {self.volume}, problem {self.problem}, page {page_number}: {clip}"
            )
        self.figure += 1
        filename = f"p{self.problem:02d}-fig{self.figure:02d}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=clip, alpha=False).save(
            self.images / filename
        )
        description = prompt_text(caption or "") or f"Figura do problema {self.problem}"
        figcaption = f"<figcaption>{html.escape(description)}</figcaption>" if caption else ""
        return self.block(
            f'<figure class="taiwan-figure"><img src="/taiwan/volume-{self.volume:02d}/{filename}" '
            f'alt="{html.escape(description)}" loading="lazy">{figcaption}</figure>'
        )

    def inline(self, value: str) -> str:
        value, math = protect_math(value)
        value = replace_simple_command(value, "textbf", "<strong>", "</strong>")
        value = replace_simple_command(value, "textit", "<em>", "</em>")
        value = replace_simple_command(value, "emph", "<em>", "</em>")
        value = replace_command(
            value,
            "href",
            2,
            lambda args: f'<a href="{html.escape(args[0])}" target="_blank" rel="noreferrer">{args[1]}</a>',
        )
        value = replace_command(
            value,
            "url",
            1,
            lambda args: f'<a href="{html.escape(args[0])}" target="_blank" rel="noreferrer">{html.escape(args[0])}</a>',
        )
        value = re.sub(r"\\(?:centering|noindent|hfill|small|medskip|bigskip)\b", "", value)
        value = re.sub(r"\\(?:vspace|Needspace)\*?\{[^}]*\}", "", value)
        value = value.replace(r"\%", "%").replace(r"\&", "&").replace("~", " ")
        value = value.replace("``", "“").replace("''", "”")
        value = re.sub(r"\\\\\s*", "<br>", value)
        return restore(value, "MATH", math).strip()

    def convert(self, value: str) -> str:
        value = strip_comments(value)
        value = replace_command(value, "sourcefigcap", 7, lambda args: self.figure_html(args[:6], args[6]))
        value = replace_command(value, "sourcefig", 6, lambda args: self.figure_html(args, None))

        def question(match: re.Match[str]) -> str:
            label, points, body = match.groups()
            points_html = f'<small class="taiwan-item-points">{html.escape(points.strip())}</small>' if points.strip() else ""
            return self.block(
                f'<section class="taiwan-item statement-row"><span>{html.escape(label.strip())}</span>'
                f'<div class="taiwan-item-body">{self.convert(body)}</div>{points_html}</section>'
            )

        def solution(match: re.Match[str]) -> str:
            label, points, body = match.groups()
            points_html = f'<small class="taiwan-item-points">{html.escape(points.strip())}</small>' if points.strip() else ""
            return self.block(
                f'<section class="taiwan-solution-item"><strong>{html.escape(label.strip())}</strong>'
                f'<div>{self.convert(body)}</div>{points_html}</section>'
            )

        value = QUESTION_ITEM_RE.sub(question, value)
        value = SOLUTION_ITEM_RE.sub(solution, value)
        value = replace_command(
            value,
            "parttitle",
            1,
            lambda args: self.block(
                f'<h2 class="statement-section statement-part-heading">{html.escape(args[0].strip())}</h2>'
            ),
        )
        value = replace_command(
            value,
            "minorhead",
            1,
            lambda args: self.block(f"<h3>{html.escape(args[0].strip())}</h3>"),
        )
        value = value.replace("\\solutionsheader", "")

        def list_block(match: re.Match[str]) -> str:
            tag = "ul" if match.group(1) == "itemize" else "ol"
            entries = [entry.strip() for entry in re.split(r"\\item\s*", match.group(2)) if entry.strip()]
            return self.block(f"<{tag}>" + "".join(f"<li>{self.convert(entry)}</li>" for entry in entries) + f"</{tag}>")

        value = LIST_RE.sub(list_block, value)

        def table_block(match: re.Match[str]) -> str:
            body = match.group(1).replace(r"\hline", "")
            rows = [row.strip() for row in re.split(r"\\\\", body) if row.strip()]
            rendered_rows = []
            for row in rows:
                cells = [self.inline(cell.strip()) for cell in re.split(r"(?<!\\)&", row)]
                rendered_rows.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in cells) + "</tr>")
            return self.block('<table class="taiwan-table"><tbody>' + "".join(rendered_rows) + "</tbody></table>")

        value = TABULAR_RE.sub(table_block, value)
        value = re.sub(r"\\begin\{(?:center|figure|quote|minipage)\}(?:\[[^]]*\])?(?:\{[^}]*\})?", "", value)
        value = re.sub(r"\\end\{(?:center|figure|quote|minipage)\}", "", value)
        value = self.inline(value)
        value = re.sub(r"\\par\b", "\n\n", value)
        value = re.sub(r"\n\s*\n+", "\n\n", value)
        chunks: list[str] = []
        # A semantic block may sit between two prose lines without a blank line.
        # Split on every placeholder so headings, figures and item sections can
        # never become invalid children of a paragraph.
        for piece in re.split(r"(@@BLOCK\d+@@)", value):
            piece = piece.strip()
            if not piece:
                continue
            if re.fullmatch(r"@@BLOCK\d+@@", piece):
                chunks.append(piece)
                continue
            for paragraph in re.split(r"\n\s*\n+", piece):
                paragraph = paragraph.strip()
                if not paragraph:
                    continue
                if paragraph.startswith(("<ul>", "<ol>")):
                    chunks.append(paragraph)
                else:
                    chunks.append(f"<p>{paragraph}</p>")
        result = restore("\n".join(chunks), "BLOCK", self.blocks)
        result = re.sub(r"<p>\s*</p>", "", result)
        return result.strip()


def extract_exercise_title(block: str) -> str:
    start = block.find(r"\exercise")
    if start < 0:
        raise ValueError("Exercise command missing")
    arguments, _ = command_arguments(block, start, "exercise", 2)
    return clean_title(arguments[1])


def summary_pages(source: str, expected: int) -> list[int]:
    preamble = source[: source.find('%<exercise')]
    entries = SUMMARY_RE.findall(preamble)
    pages = [int(page) for number, _title, page in entries if int(number) <= expected]
    if len(pages) != expected:
        raise ValueError(f"Expected {expected} summary pages, found {len(pages)}")
    return pages


def build_semantic_volume(volume: int, directory: Path, data_dir: Path, public_dir: Path) -> dict:
    tex = directory / "main.tex"
    pdf_candidates = list(directory.glob("*.pdf"))
    if len(pdf_candidates) != 1:
        raise ValueError(f"Expected one PDF in {directory}, found {len(pdf_candidates)}")
    pdf_path = pdf_candidates[0]
    source = tex.read_text(encoding="utf-8")
    blocks = EXERCISE_BLOCK_RE.findall(source)
    if not blocks:
        raise ValueError(f"No semantic exercises found in volume {volume}")
    pages = summary_pages(source, len(blocks))
    images = public_dir / f"volume-{volume:02d}"
    if images.exists():
        shutil.rmtree(images)
    images.mkdir(parents=True)
    copied_pdf = public_dir / f"taiwan-{volume:02d}.pdf"
    shutil.copy2(pdf_path, copied_pdf)
    pdf = pymupdf.open(pdf_path)
    problems = []
    image_count = 0
    part_count = 0
    for ordinal, (identifier, block) in enumerate(blocks, start=1):
        problem_id = int(identifier)
        if problem_id != ordinal:
            raise ValueError(f"Unexpected problem id {problem_id} at ordinal {ordinal} in volume {volume}")
        statement_match = STATEMENT_RE.search(block)
        solution_match = SOLUTION_RE.search(block)
        if not statement_match:
            raise ValueError(f"Statement missing in volume {volume}, problem {problem_id}")
        statement_tex = disambiguate_item_codes(statement_match.group(1))
        solution_tex = solution_match.group(1) if solution_match else ""
        items = list(QUESTION_ITEM_RE.finditer(statement_tex))
        parts = [
            {
                "code": item.group(1).strip(),
                "ordinal": index,
                "score": score_value(item.group(2)),
                "prompt_text": prompt_text(item.group(3)),
            }
            for index, item in enumerate(items, start=1)
        ]
        if not parts:
            parts = [{"code": "Q", "ordinal": 1, "score": None, "prompt_text": prompt_text(statement_tex)}]
        converter = Converter(pdf, images, volume, problem_id)
        statement_html = converter.convert(statement_tex)
        if parts[0]["code"] == "Q":
            statement_html = '<section class="taiwan-item statement-row"><span>Q</span></section>\n' + statement_html
        solution_html = converter.convert(solution_tex) if solution_tex.strip() else None
        page_start = pages[problem_id - 1]
        page_end = max(page_start, pages[problem_id] - 1) if problem_id < len(pages) else len(pdf)
        problems.append(
            {
                "id": problem_id,
                "code": f"{problem_id:02d}",
                "title_pt": extract_exercise_title(block),
                "page_start": page_start,
                "page_end": page_end,
                "source_url": f"/taiwan/taiwan-{volume:02d}.pdf#page={page_start}",
                "statement_html": statement_html,
                "solution_html": solution_html,
                "parts": parts,
            }
        )
        image_count += converter.figure
        part_count += len(parts)
    pdf.close()
    result = {
        "schema_version": 2,
        "collection": f"Taiwan - volume {volume}",
        "volume": volume,
        "source_pdf": f"/taiwan/taiwan-{volume:02d}.pdf",
        "language": "pt-BR",
        "problems": problems,
    }
    output = data_dir / f"volume-{volume:02d}.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "volume": volume,
        "problems": len(problems),
        "parts": part_count,
        "images": image_count,
        "solutions": sum(bool(problem["solution_html"]) for problem in problems),
        "source_tex_sha256": sha256(tex),
        "source_pdf_sha256": sha256(pdf_path),
        "output_sha256": sha256(output),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--data", default=Path("data/taiwan"), type=Path)
    parser.add_argument("--public", default=Path("public/taiwan"), type=Path)
    args = parser.parse_args()
    args.data.mkdir(parents=True, exist_ok=True)
    args.public.mkdir(parents=True, exist_ok=True)
    manifest = []
    for volume in range(1, 10):
        manifest.append(
            build_semantic_volume(
                volume,
                args.source / f"Volume_{volume:02d}",
                args.data,
                args.public,
            )
        )
        print(json.dumps(manifest[-1], ensure_ascii=False), flush=True)
    volume_10 = json.loads((args.data / "volume-10.json").read_text(encoding="utf-8"))
    manifest.append(
        {
            "volume": 10,
            "problems": len(volume_10["problems"]),
            "parts": sum(len(problem["parts"]) for problem in volume_10["problems"]),
            "images": len(list((args.public / "volume-10").glob("*.png"))),
            "solutions": sum(bool(problem["solution_html"]) for problem in volume_10["problems"]),
            "source_tex_sha256": sha256(args.source / "Volume_10" / "main.tex"),
            "source_pdf_sha256": sha256(args.source / "Volume_10" / "taiwan 10.pdf"),
            "output_sha256": sha256(args.data / "volume-10.json"),
        }
    )
    catalog = {
        "schema_version": 1,
        "collection": "Taiwan",
        "language": "pt-BR",
        "volumes": [
            json.loads((args.data / f"volume-{volume:02d}.json").read_text(encoding="utf-8"))
            for volume in range(1, 11)
        ],
    }
    (args.data / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    index = {
        "schema_version": 1,
        "collection": "Taiwan",
        "volumes": [
            {
                "volume": item["volume"],
                "problems": [
                    {
                        "id": problem["id"],
                        "code": problem["code"],
                        "title_pt": problem["title_pt"],
                        "parts": [{"code": part["code"]} for part in problem["parts"]],
                    }
                    for problem in item["problems"]
                ],
            }
            for item in catalog["volumes"]
        ],
    }
    (args.data / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    (args.data / "import-manifest.json").write_text(
        json.dumps({"volumes": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    totals = {
        key: sum(int(item[key]) for item in manifest)
        for key in ("problems", "parts", "images", "solutions")
    }
    print(json.dumps({"status": "ok", **totals}, ensure_ascii=False))


if __name__ == "__main__":
    main()

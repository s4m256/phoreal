from __future__ import annotations

import argparse
import html
import json
import re
import shutil
from pathlib import Path

import pymupdf


PROBLEM_RE = re.compile(r"\\problem\{([^}]*)\}")
ITEM_RE = re.compile(r"\\begin\{itembox\}\{([^}]*)\}(.*?)\\end\{itembox\}", re.S)
IMAGE_RE = re.compile(r"\\includegraphics\[([^]]*)\]\{\\sourcepdf\}")
SOLUTION_RE = re.compile(r"\\minorhead\{Solu(?:ção|ções)\}", re.I)
PART_RE = re.compile(r"\\parttitle\{([^}]*)\}")
FIGURE_HTML_RE = re.compile(r'<figure class="taiwan-figure">.*?</figure>', re.S)

# Some source-PDF figures are physically placed after the answer even though
# they define the setup referenced by the statement. Keep those with the
# statement, including the bubble diagram printed beside problem 29 but used
# by problem 28.
STATEMENT_FIGURE_TARGETS = {
    "p02-fig01.png": 2,
    "p03-fig01.png": 3, "p03-fig02.png": 3,
    "p04-fig02.png": 4,
    "p08-fig02.png": 8,
    "p10-fig01.png": 10, "p10-fig02.png": 10,
    "p23-fig01.png": 23, "p23-fig02.png": 23,
    "p24-fig01.png": 24,
    "p25-fig01.png": 25,
    "p26-fig01.png": 26,
    "p27-fig01.png": 27,
    "p29-fig01.png": 28,
    "p29-fig02.png": 29,
}


def strip_comments(value: str) -> str:
    return re.sub(r"(?<!\\)%.*", "", value)


def replace_simple_command(value: str, command: str, opening: str, closing: str) -> str:
    marker = f"\\{command}{{"
    while marker in value:
        start = value.find(marker)
        depth = 1
        index = start + len(marker)
        while index < len(value) and depth:
            if value[index] == "{" and value[index - 1] != "\\":
                depth += 1
            elif value[index] == "}" and value[index - 1] != "\\":
                depth -= 1
            index += 1
        if depth:
            break
        inner = value[start + len(marker): index - 1]
        value = value[:start] + opening + inner + closing + value[index:]
    return value


def protect_math(value: str) -> tuple[str, list[str]]:
    math: list[str] = []
    pattern = re.compile(r"(\\\[.*?\\\]|\\\(.*?\\\)|\$\$.*?\$\$|(?<!\\)\$(?!\$).*?(?<!\\)\$)", re.S)

    def hold(match: re.Match[str]) -> str:
        math.append(match.group(0))
        return f"@@MATH{len(math) - 1}@@"

    return pattern.sub(hold, value), math


def restore_tokens(value: str, prefix: str, tokens: list[str]) -> str:
    for index, token in enumerate(tokens):
        value = value.replace(f"@@{prefix}{index}@@", token)
    return value


def plain_text(value: str) -> str:
    value = IMAGE_RE.sub(" ", value)
    value = re.sub(r"\\(?:begin|end)\{[^}]+\}(?:\{[^}]*\})?", " ", value)
    value = re.sub(r"\\(?:parttitle|minorhead|textbf|textit|emph|url)\{([^}]*)\}", r"\1", value)
    value = re.sub(r"\\(?:par|centering|noindent|hfill|quad|qquad)\b", " ", value)
    value = re.sub(r"\\[A-Za-z]+", " ", value)
    value = re.sub(r"[{}$]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def title_case(value: str) -> str:
    value = re.sub(r"^\s*\d+\.\s*", "", plain_text(value)).strip()
    value = value.lower().title()
    replacements = {
        "Iphoc": "IPhOC", "Aharonov-Casher": "Aharonov-Casher",
        "Rayleigh-Bénard": "Rayleigh-Bénard", "Feynman": "Feynman",
        "Mansuripur": "Mansuripur", "Schumann": "Schumann", "Tianwu": "Tianwu",
        "Laser": "laser", "Óptico": "óptico", "Eletro-Óptico": "eletro-óptico",
    }
    for before, after in replacements.items():
        value = value.replace(before, after)
    return value


class Converter:
    def __init__(self, pdf: pymupdf.Document, output_images: Path, problem_number: int):
        self.pdf = pdf
        self.output_images = output_images
        self.problem_number = problem_number
        self.figure_number = 0
        self.blocks: list[str] = []

    def block(self, value: str) -> str:
        self.blocks.append(value)
        return f"@@BLOCK{len(self.blocks) - 1}@@"

    def crop_image(self, match: re.Match[str]) -> str:
        options = match.group(1)
        page_match = re.search(r"page=(\d+)", options)
        trim_match = re.search(r"trim=([\d.]+)bp\s+([\d.]+)bp\s+([\d.]+)bp\s+([\d.]+)bp", options)
        if not page_match or not trim_match:
            raise ValueError(f"Unsupported image options: {options}")
        page_number = int(page_match.group(1))
        left, bottom, right, top = map(float, trim_match.groups())
        page = self.pdf[page_number - 1]
        bounds = page.rect
        clip = pymupdf.Rect(left, top, bounds.width - right, bounds.height - bottom) & bounds
        if clip.is_empty or clip.width < 2 or clip.height < 2:
            raise ValueError(f"Invalid crop on PDF page {page_number}: {clip}")
        self.figure_number += 1
        filename = f"p{self.problem_number:02d}-fig{self.figure_number:02d}.png"
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=clip, alpha=False)
        pixmap.save(self.output_images / filename)
        return self.block(
            f'<figure class="taiwan-figure"><img src="/taiwan/volume-10/{filename}" '
            f'alt="Figura do problema {self.problem_number}" loading="lazy"></figure>'
        )

    def convert_inline(self, value: str) -> str:
        value, math_tokens = protect_math(value)
        value = replace_simple_command(value, "textbf", "<strong>", "</strong>")
        value = replace_simple_command(value, "textit", "<em>", "</em>")
        value = replace_simple_command(value, "emph", "<em>", "</em>")
        value = re.sub(r"\\href\{([^}]*)\}\{([^}]*)\}", r'<a href="\1" target="_blank" rel="noreferrer">\2</a>', value)
        value = re.sub(r"\\url\{([^}]*)\}", r'<a href="\1" target="_blank" rel="noreferrer">\1</a>', value)
        value = re.sub(r"\\(?:centering|noindent|hfill)\b", "", value)
        value = re.sub(r"\\(?:vspace|Needspace)\*?\{[^}]*\}", "", value)
        value = value.replace(r"\%", "%").replace(r"\&", "&").replace("~", " ")
        value = re.sub(r"\\\\\s*", "<br>", value)
        value = restore_tokens(value, "MATH", math_tokens)
        return value.strip()

    def convert(self, value: str) -> str:
        value = strip_comments(value)
        value = IMAGE_RE.sub(self.crop_image, value)

        def item(match: re.Match[str]) -> str:
            label = html.escape(match.group(1).strip())
            inner = re.sub(r"\\par\b", "<br><br>", self.convert_inline(match.group(2)))
            return self.block(f'<section class="taiwan-item statement-row"><span>{label}</span>{inner}</section>')

        value = ITEM_RE.sub(item, value)
        value = PART_RE.sub(lambda match: self.block(f'<h2 class="statement-section statement-part-heading">{html.escape(match.group(1).strip())}</h2>'), value)
        value = re.sub(r"\\minorhead\{([^}]*)\}", lambda match: self.block(f'<h3>{html.escape(match.group(1).strip())}</h3>'), value)
        value = re.sub(r"\\caption\{([^}]*)\}", lambda match: self.block(f'<figcaption>{html.escape(match.group(1).strip())}</figcaption>'), value)
        value = re.sub(r"\\begin\{(?:figure|center|minipage)\}(?:\[[^]]*\])?(?:\{[^}]*\})?", "", value)
        value = re.sub(r"\\end\{(?:figure|center|minipage)\}", "", value)
        value = re.sub(r"\\begin\{tabular\}\{[^}]*\}(.*?)\\end\{tabular\}", lambda match: self.block(f'<pre class="taiwan-table">{html.escape(plain_text(match.group(1)))}</pre>'), value, flags=re.S)
        value = self.convert_inline(value)
        value = re.sub(r"\\par\b", "\n\n", value)
        value = re.sub(r"\n\s*\n+", "\n\n", value)
        chunks = []
        for chunk in re.split(r"\n\n+", value):
            chunk = chunk.strip()
            if not chunk:
                continue
            if re.fullmatch(r"(?:@@BLOCK\d+@@\s*)+", chunk):
                chunks.append(chunk)
            else:
                chunks.append(f"<p>{chunk}</p>")
        result = "\n".join(chunks)
        result = restore_tokens(result, "BLOCK", self.blocks)
        return re.sub(r"<p>\s*</p>", "", result).strip()


def split_problem_sections(body: str) -> tuple[str, str]:
    boundaries = [match.start() for match in PART_RE.finditer(body)]
    sections: list[str] = []
    if boundaries:
        sections.append(body[:boundaries[0]])
        for index, start in enumerate(boundaries):
            sections.append(body[start:boundaries[index + 1] if index + 1 < len(boundaries) else len(body)])
    else:
        sections = [body]
    statement_sections: list[str] = []
    solution_sections: list[str] = []
    for section in sections:
        match = SOLUTION_RE.search(section)
        if not match:
            statement_sections.append(section)
            continue
        statement_sections.append(section[:match.start()])
        heading = PART_RE.match(section.strip())
        prefix = f"\\parttitle{{{heading.group(1)}}}\n" if heading else ""
        solution_sections.append(prefix + section[match.end():])
    return "\n".join(statement_sections), "\n".join(solution_sections)


def parts_for(statement_tex: str) -> list[dict]:
    matches = list(ITEM_RE.finditer(statement_tex))
    parts = []
    for ordinal, match in enumerate(matches, start=1):
        after = statement_tex[match.end(): matches[ordinal].start() if ordinal < len(matches) else len(statement_tex)]
        score_match = re.match(r"\s*(?:\\par\s*)?(\d+(?:[.,]\d+)?)\s*pt\b", after, re.I)
        score = float(score_match.group(1).replace(",", ".")) if score_match else None
        parts.append({
            "code": match.group(1).strip(),
            "ordinal": ordinal,
            "score": score,
            "prompt_text": plain_text(match.group(2)),
        })
    if not parts:
        parts.append({"code": "Q", "ordinal": 1, "score": None, "prompt_text": plain_text(statement_tex)})
    return parts


def place_statement_figures(problems: list[dict]) -> None:
    by_id = {int(problem["id"]): problem for problem in problems}
    moved: set[str] = set()
    for problem in problems:
        solution = problem.get("solution_html") or ""
        for figure in FIGURE_HTML_RE.findall(solution):
            filename_match = re.search(r'/([^/]+\.png)', figure)
            if not filename_match:
                continue
            filename = filename_match.group(1)
            target_id = STATEMENT_FIGURE_TARGETS.get(filename)
            if target_id is None:
                continue
            problem["solution_html"] = (problem.get("solution_html") or "").replace(figure, "").strip() or None
            target = by_id[target_id]
            target["statement_html"] = f'{target["statement_html"]}\n{figure}'.strip()
            moved.add(filename)
    missing = set(STATEMENT_FIGURE_TARGETS) - moved
    if missing:
        raise ValueError(f"Statement figures not found in solution HTML: {sorted(missing)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tex", required=True, type=Path)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--existing", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--images", required=True, type=Path)
    args = parser.parse_args()

    source = args.tex.read_text(encoding="utf-8")
    existing = json.loads(args.existing.read_text(encoding="utf-8"))
    existing_by_id = {int(problem["id"]): problem for problem in existing["problems"]}
    matches = list(PROBLEM_RE.finditer(source))
    if len(matches) != 31:
        raise ValueError(f"Expected 31 problems, found {len(matches)}")

    if args.images.exists():
        shutil.rmtree(args.images)
    args.images.mkdir(parents=True)
    pdf = pymupdf.open(args.pdf)
    problems = []
    total_images = 0
    total_parts = 0
    for index, match in enumerate(matches, start=1):
        body = source[match.end(): matches[index].start() if index < len(matches) else source.find(r"\end{document}", match.end())]
        statement_tex, solution_tex = split_problem_sections(body)
        parts = parts_for(statement_tex)
        converter = Converter(pdf, args.images, index)
        statement_html = converter.convert(statement_tex)
        if parts[0]["code"] == "Q":
            statement_html = f'<section class="taiwan-item statement-row"><span>Q</span></section>{statement_html}'
        solution_html = converter.convert(solution_tex) if solution_tex.strip() else None
        metadata = existing_by_id[index]
        problems.append({
            "id": index,
            "code": f"{index:02d}",
            "title_pt": title_case(match.group(1)),
            "page_start": metadata["page_start"],
            "page_end": metadata["page_end"],
            "source_url": metadata["source_url"],
            "statement_html": statement_html,
            "solution_html": solution_html,
            "parts": parts,
        })
        total_images += converter.figure_number
        total_parts += len(parts)
    pdf.close()
    place_statement_figures(problems)

    result = {
        "schema_version": 2,
        "collection": "Taiwan - volume 10",
        "volume": 10,
        "source_pdf": "/taiwan/taiwan-10.pdf",
        "language": "pt-BR",
        "problems": problems,
    }
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"problems": len(problems), "parts": total_parts, "images": total_images, "solutions": sum(bool(problem["solution_html"]) for problem in problems)}))


if __name__ == "__main__":
    main()

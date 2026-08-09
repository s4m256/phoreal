"""Apply the human-reviewed direct pt-BR translation for X24-T1.

This record is deliberately explicit: it preserves the source HTML verbatim and
only replaces its Russian text nodes. Formulas, item labels, scores and images
remain sourced from xy.pho.rs and are validated after the update.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


TITLE_PT = "Física das gotas de chuva"

STATEMENT_TRANSLATIONS = {
    3: "O mecanismo de formação das nuvens pode ser descrito, em linhas gerais, da seguinte forma. O ar úmido sobe e esfria com a altitude, fazendo com que o vapor de água fique supersaturado, isto é, sua pressão parcial se torna maior que a pressão de vapor saturado à temperatura correspondente. Então, o vapor de água começa a condensar e formar gotículas de água. Enquanto essas gotículas são suficientemente pequenas, elas caem lentamente e permanecem na nuvem. Se forem grandes o bastante para alcançar a Terra sem evaporar, começa a chover. Neste problema, consideramos o mecanismo de formação de gotículas em vapor de água supersaturado e seu crescimento posterior por difusão.",
    9: "Neste problema, usam-se as seguintes notações e valores numéricos",
    10: "$\\sigma = 7.5 \\cdot 10^{-2} ~\\text{Н}/\\text{м}$ – coeficiente de tensão superficial da água;",
    11: "$T = 283~\\text{К}$ – temperatura da atmosfera;",
    12: "$p_s = 1.23~\\text{кПа}$ – pressão de vapor de água saturado à temperatura atmosférica considerada;",
    13: "$\\rho_s$ – densidade do vapor de água saturado a essa temperatura;",
    14: "$p_v$, $\\rho_v$ – pressão e densidade do vapor de água na atmosfera;",
    15: "$\\varphi = \\rho_v/\\rho_s = p_v/p_s$ – fator de supersaturação do vapor de água;",
    16: "$\\rho_L = 1.0 \\cdot 10^3 ~\\text{кг}/\\text{м}^3$ – densidade da água;",
    17: "$\\mu = 0.018 ~\\text{кг}/\\text{моль}$ – massa molar da água;",
    18: "$m$ – massa de uma molécula de água;",
    19: "$k = 1.38 \\cdot 10^{-23}~\\text{Дж}/\\text{К}$ – constante de Boltzmann;",
    20: "$L = 2.48 ~\\text{МДж}/\\text{К}$ – calor latente específico de vaporização da água;",
    21: "$R = 8.31~\\text{Дж}/(\\text{моль} \\cdot \\text{К})$ – constante universal dos gases;",
    22: "$N_A = 6.02 \\cdot 10^{23}~\\text{моль}^{-1}$ – constante de Avogadro.",
    23: "O vapor de água pode ser considerado um gás ideal em todas as partes do problema.",
    32: "Parte A. Gotículas em uma atmosfera homogênea (4 pontos)",
    40: "Suponha que a atmosfera seja composta apenas de ar e vapor de água, sem impurezas. Para formar uma gotícula, é necessário gastar energia adicional para criar a superfície da água. Portanto, mesmo no vapor de água supersaturado, a formação de gotículas é dificultada, pois, em tamanhos pequenos, a contribuição relativa da energia de superfície é grande.",
    41: "Da termodinâmica, sabe-se que, para um processo a energia constante, sua possibilidade é determinada pelo valor da energia livre de Gibbs $G$. Quanto maior a energia livre necessária, menos provável é o processo. Investigue como a energia livre necessária para formar uma gotícula depende de seu raio $r$. Para isso, você precisará dos seguintes fatos:",
    42: "A energia livre da superfície de um líquido com área $A$ é $\\Delta G_{surf} = \\sigma A$, onde $\\sigma$ é o coeficiente de tensão superficial.",
    43: "A energia livre de um mol de vapor de água saturado é igual à energia livre de um mol de água (desconsiderando a energia de superfície), à mesma temperatura e pressão.",
    44: "A diferença entre as energias livres de um mol de vapor de água supersaturado e de vapor de água saturado, à mesma temperatura, é $\\Delta G_v= R T \\ln \\varphi$ ($\\varphi = \\rho_v/\\rho_s > 1$ é o fator de supersaturação do vapor). A energia livre do vapor de água é proporcional à sua quantidade de matéria.",
    56: "Determine a variação da energia livre do vapor de água quando dele se forma uma gotícula de raio $r$. Expresse sua resposta em termos de $r$, $\\sigma$, $\\varphi$, $R$, $T$, $\\rho_L$, $\\mu$.",
    67: "Determine o valor crítico do raio da gotícula $r_c$, para o qual $\\Delta G$ é máximo, bem como o valor correspondente de $\\Delta G_с$. Expresse sua resposta em termos de $\\sigma$, $\\varphi$, $R$, $T$, $\\rho_L$, $\\mu$. Determine o valor numérico de $r_c$ para $\\varphi = 1.01$.",
    73: "Enquanto a gotícula não atingir o raio $r_c$, seu crescimento é acompanhado por um aumento da energia livre e, portanto, é pouco provável. Assim que o raio ultrapassa o valor crítico, o crescimento posterior ocorre sem dificuldade, com diminuição da energia livre. Portanto, ao estudar o número de gotículas formadas, podemos nos concentrar nas gotículas de raio crítico. Uma gotícula pode se formar em torno de qualquer molécula de água; porém, a probabilidade desse processo é pequena e é determinada pela energia livre necessária. Da mecânica estatística, segue que a concentração de centros em torno dos quais a condensação pode efetivamente ocorrer é",
    76: "$$onde $n$ é a concentração de moléculas de água no vapor, e $\\Delta G_c$ foi determinado no item anterior.",
    88: "Considere uma gotícula de raio crítico $r_c$. Determine o tempo $\\tau$ necessário para que o número de moléculas nela aumente em $g$. Expresse sua resposta em termos de $r_c$, $g$, $p_s$, $m$, $k$, $T$, $\\varphi$. Considere que, durante o crescimento, o raio da gotícula não varia e que a evaporação de moléculas da gotícula pode ser desprezada.",
    89: "Sabe-se que, sobre uma área de superfície $dS$, durante um intervalo de tempo $dt$, incidem",
    93: "moléculas. Aqui, $p_v$ é a pressão do vapor, $m$ é a massa de uma molécula e $T$ é a temperatura do gás.",
    99: "Consideraremos o tempo $\\tau$ como o tempo característico de crescimento de gotículas a partir de um embrião. Durante o tempo $\\tau$, todos os embriões presentes no sistema se transformam em gotículas de raio crítico e, em seus lugares, surgem novos embriões na mesma quantidade.",
    110: "Determine o número de gotículas $J$ que se formam por unidade de tempo e por unidade de volume de vapor de água supersaturado. Expresse sua resposta em termos de $\\sigma$, $\\varphi$, $p_s$, $r_c$, $T$, $g$.",
    121: "Os resultados do item anterior mostram que a taxa de formação de gotículas depende muito fortemente do fator de supersaturação do vapor. Determine numericamente o valor do fator de supersaturação $\\varphi$ para o qual, à temperatura $T = 283~\\text{К}$, nasce uma gotícula por segundo em $1~\\text{см}^3$ de ar. Considere $g = 100$. Os demais dados numéricos estão no início do problema.",
    129: "Parte B. Crescimento difusivo das gotículas (4 pontos)",
    137: "Nesta parte, usaremos as seguintes notações, além das apresentadas no início do problema:",
    138: "$\\rho_v$ – densidade do vapor de água a grande distância da gotícula;",
    139: "$\\rho_r$ – densidade do vapor de água nas proximidades da superfície da gotícula;",
    140: "$\\rho_s$ – densidade do vapor de água saturado à temperatura da atmosfera, a grande distância da gotícula;",
    141: "$T = 283~\\text{К}$ – temperatura da atmosfera a grande distância da gotícula;",
    142: "$T_r$ – temperatura da gotícula;",
    143: "$K =2.40 \\cdot 10^{-2} ~\\text{Дж}/ (\\text{м} \\cdot \\text{с} \\cdot \\text{К})$ – condutividade térmica do ar;",
    144: "$D = 2.36 \\cdot 10^{-5}~\\text{м}^2/\\text{с}$ – coeficiente de difusão do vapor de água no ar;",
    145: "$r$ – raio da gotícula;",
    146: "$M$ – massa da gotícula.",
    153: "A gotícula cresce por difusão. A taxa de variação de sua massa e a taxa de remoção de calor são dadas por",
    156: "$$Suponha que a temperatura da gotícula permaneça constante durante o crescimento e que todo o calor seja liberado apenas pela condensação da água.",
    167: "Para o vapor saturado em equilíbrio com o líquido, expresse a derivada da pressão em relação à temperatura, $dp_s/dT$, em termos de $p_s$, $L$, $R$, $T$, $\\mu$. Usando o resultado obtido, determine a variação relativa da densidade do vapor de água saturado $\\Delta \\rho_s/\\rho_s$ para uma pequena variação de temperatura $\\Delta T$. Expresse sua resposta em termos de $\\Delta T$, $T$, $L$, $\\mu$, $R$. Você pode usar a relação entre pequenas variações de pressão, densidade e temperatura de um gás ideal",
    181: "Expresse $dQ/dt$ em termos de $dM/dt$ e $L$.",
    192: "Usando o resultado do item anterior e a equação de condução de calor, expresse a diferença entre as temperaturas da gotícula e da atmosfera, $T_r- T$, em termos de $dM/dt$, $r$, $L$ e $K$.",
    203: "Suponha que, nas proximidades da superfície da gotícula, a densidade do vapor de água seja igual à densidade do vapor saturado à temperatura da gotícula. Considerando pequenas as diferenças de temperatura e de densidade e usando os resultados de $B1$ e $B3$, expresse a razão $(\\rho_r - \\rho_s)/\\rho_s$ (onde $\\rho_r$ é a densidade de vapor nas proximidades da superfície da gotícula) em termos de $L$, $r$, $K$, $\\mu$, $R$, $T$ e $dM/dt$.",
    214: "Usando a equação de difusão, expresse a razão $(\\rho_r - \\rho_v)/\\rho_s$ em termos de $dM/dt$, $r$, $D$, $\\rho_s$.",
    225: "Eliminando das respostas dos dois itens anteriores a densidade de vapor nas proximidades da superfície da gotícula $\\rho_r$, obtenha uma expressão para $dM/dt$. Expresse sua resposta em termos de $\\varphi$, $\\mu$, $R$, $T$, $D$, $p_s$, $L$, $K$, $r$.",
    236: "A velocidade de crescimento do raio da gotícula é dada por",
    240: "Determine $k$ e $\\xi$; expresse sua resposta em termos de $\\varphi $, $\\rho_L$, $\\mu$, $R$, $T$, $D$, $p_s$, $L$, $K$.",
    251: "Determine a dependência do raio da gotícula em função do tempo. O raio inicial da gotícula é $r_0$. Expresse sua resposta em termos de $r_0$, $\\xi$, $t$.",
    262: "Suponha que o raio inicial da gotícula seja $r_0 = 0.7~\\text{мкм}$. Determine numericamente o tempo necessário para que ela cresça até o raio $r_1 = 10~\\text{мкм}$, para o fator de supersaturação $\\varphi = 1.1$. Os demais valores numéricos estão no início desta parte.",
}

PART_TRANSLATIONS = {
    "A1": "Determine a variação da energia livre do vapor de água quando dele se forma uma gotícula de raio $r$. Expresse sua resposta em termos de $r$, $\\sigma$, $\\varphi$, $R$, $T$, $\\rho_L$, $\\mu$.",
    "A2": "Determine o valor crítico do raio da gotícula $r_c$, para o qual $\\Delta G$ é máximo, bem como o valor correspondente de $\\Delta G_с$. Expresse sua resposta em termos de $\\sigma$, $\\varphi$, $R$, $T$, $\\rho_L$, $\\mu$. Determine o valor numérico de $r_c$ para $\\varphi = 1.01$.",
    "A3": "Considere uma gotícula de raio crítico $r_c$. Determine o tempo $\\tau$ necessário para que o número de moléculas nela aumente em $g$. Expresse sua resposta em termos de $r_c$, $g$, $p_s$, $m$, $k$, $T$, $\\varphi$. Considere que, durante o crescimento, o raio da gotícula não varia e que a evaporação de moléculas da gotícula pode ser desprezada. Sabe-se que, sobre uma área de superfície $dS$, durante um intervalo de tempo $dt$, incidem $$ dN = dt dS \\frac{p_v}{\\sqrt{2\\pi m k T}} $$ moléculas. Aqui, $p_v$ é a pressão do vapor, $m$ é a massa de uma molécula e $T$ é a temperatura do gás.",
    "A4": "Determine o número de gotículas $J$ que se formam por unidade de tempo e por unidade de volume de vapor de água supersaturado. Expresse sua resposta em termos de $\\sigma$, $\\varphi$, $p_s$, $r_c$, $T$, $g$.",
    "A5": "Os resultados do item anterior mostram que a taxa de formação de gotículas depende muito fortemente do fator de supersaturação do vapor. Determine numericamente o valor do fator de supersaturação $\\varphi$ para o qual, à temperatura $T = 283~\\text{К}$, nasce uma gotícula por segundo em $1~\\text{см}^3$ de ar. Considere $g = 100$. Os demais dados numéricos estão no início do problema.",
    "B1": "Para o vapor saturado em equilíbrio com o líquido, expresse a derivada da pressão em relação à temperatura, $dp_s/dT$, em termos de $p_s$, $L$, $R$, $T$, $\\mu$. Usando o resultado obtido, determine a variação relativa da densidade do vapor de água saturado $\\Delta \\rho_s/\\rho_s$ para uma pequena variação de temperatura $\\Delta T$. Expresse sua resposta em termos de $\\Delta T$, $T$, $L$, $\\mu$, $R$. Você pode usar a relação entre pequenas variações de pressão, densidade e temperatura de um gás ideal $$ \\frac{\\Delta p_s}{p_s} = \\frac{\\Delta \\rho_s}{\\rho_s} +\\frac {\\Delta T}{T}. $$",
    "B2": "Expresse $dQ/dt$ em termos de $dM/dt$ e $L$.",
    "B3": "Usando o resultado do item anterior e a equação de condução de calor, expresse a diferença entre as temperaturas da gotícula e da atmosfera, $T_r- T$, em termos de $dM/dt$, $r$, $L$ e $K$.",
    "B4": "Suponha que, nas proximidades da superfície da gotícula, a densidade do vapor de água seja igual à densidade do vapor saturado à temperatura da gotícula. Considerando pequenas as diferenças de temperatura e de densidade e usando os resultados de $B1$ e $B3$, expresse a razão $(\\rho_r - \\rho_s)/\\rho_s$ (onde $\\rho_r$ é a densidade de vapor nas proximidades da superfície da gotícula) em termos de $L$, $r$, $K$, $\\mu$, $R$, $T$ e $dM/dt$.",
    "B5": "Usando a equação de difusão, expresse a razão $(\\rho_r - \\rho_v)/\\rho_s$ em termos de $dM/dt$, $r$, $D$, $\\rho_s$.",
    "B6": "Eliminando das respostas dos dois itens anteriores a densidade de vapor nas proximidades da superfície da gotícula $\\rho_r$, obtenha uma expressão para $dM/dt$. Expresse sua resposta em termos de $\\varphi$, $\\mu$, $R$, $T$, $D$, $p_s$, $L$, $K$, $r$.",
    "B7": "A velocidade de crescimento do raio da gotícula é dada por $$ \\frac{dr}{dt} = \\frac{\\xi}{r^k}. $$ Determine $k$ e $\\xi$; expresse sua resposta em termos de $\\varphi $, $\\rho_L$, $\\mu$, $R$, $T$, $D$, $p_s$, $L$, $K$.",
    "B8": "Determine a dependência do raio da gotícula em função do tempo. O raio inicial da gotícula é $r_0$. Expresse sua resposta em termos de $r_0$, $\\xi$, $t$.",
    "B9": "Suponha que o raio inicial da gotícula seja $r_0 = 0.7~\\text{мкм}$. Determine numericamente o tempo necessário para que ela cresça até o raio $r_1 = 10~\\text{мкм}$, para o fator de supersaturação $\\varphi = 1.1$. Os demais valores numéricos estão no início desta parte.",
}


def load_pipeline():
    path = Path(__file__).with_name("external-phors-translation.py")
    spec = importlib.util.spec_from_file_location("external_phors_translation", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="data/phors-full.sqlite")
    parser.add_argument("--artifact", default="data/translations/x24-t1-direct.json")
    args = parser.parse_args()
    pipeline = load_pipeline()
    connection = sqlite3.connect(args.db)
    connection.row_factory = sqlite3.Row
    problem = connection.execute(
        """SELECT p.* FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id
        WHERE e.code='X24' AND p.code='T1'"""
    ).fetchone()
    if not problem:
        raise RuntimeError("X24-T1 is missing")
    found_nodes = {index for index, _ in pipeline.translatable_html_nodes(problem["statement_html_original"])}
    if set(STATEMENT_TRANSLATIONS) != found_nodes:
        raise RuntimeError("Direct translation does not cover exactly the source text nodes")
    translated_html = pipeline.rebuild_html(problem["statement_html_original"], problem["id"], {
        f"statement:{problem['id']}:{index}": value for index, value in STATEMENT_TRANSLATIONS.items()
    })
    parts = connection.execute("SELECT id,code FROM phors_problem_parts WHERE problem_id=? ORDER BY ordinal", (problem["id"],)).fetchall()
    if {part["code"] for part in parts} != set(PART_TRANSLATIONS):
        raise RuntimeError("Direct translation does not cover exactly the problem parts")
    connection.execute(
        """UPDATE phors_problems SET title_pt=?,statement_html_pt=?,translation_status='verified',
        translation_source_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?""",
        (TITLE_PT, translated_html, problem["statement_content_hash"], problem["id"]),
    )
    for part in parts:
        connection.execute("UPDATE phors_problem_parts SET prompt_text_pt=? WHERE id=?", (PART_TRANSLATIONS[part["code"]], part["id"]))
    connection.execute("UPDATE phors_tags SET name_pt='Fenômenos de transporte' WHERE id=126")
    connection.commit()
    artifact = {
        "schema_version": 1,
        "exam": "X24",
        "problem": "T1",
        "locale": "pt-BR",
        "status": "verified_direct_translation",
        "translated_at": datetime.now(timezone.utc).isoformat(),
        "source_hash": problem["statement_content_hash"],
        "translation_hash": hashlib.sha256(translated_html.encode("utf-8")).hexdigest(),
        "title_pt": TITLE_PT,
        "statement_nodes": STATEMENT_TRANSLATIONS,
        "parts": PART_TRANSLATIONS,
    }
    artifact_path = Path(args.artifact)
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": artifact["status"], "problem": "X24-T1", "nodes": len(STATEMENT_TRANSLATIONS), "parts": len(PART_TRANSLATIONS)}, ensure_ascii=False))
    connection.close()


if __name__ == "__main__":
    main()

"""Replace a reviewed finite set of stray non-Portuguese words in result files."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


REPLACEMENTS = {
    "mas այստեղ a haste": "mas aqui a haste",
    "fótons ըստ do comprimento": "fótons de acordo com o comprimento",
    "Considere նաև toda seção": "Considere também toda seção",
    "considere նաև que": "considere também que",
    "Aqui նույնպես deve-se": "Aqui também se deve",
    "cada momento magnético կունենha": "cada momento magnético terá",
    "Neste problema, თქვენ deverão": "Neste problema, vocês deverão",
    "Neste problema, თქვენ deverá": "Neste problema, você deverá",
    "Nesta questão, თქვენ deverão": "Nesta questão, vocês deverão",
    "nesta parte, თქვენ deve": "nesta parte, você deve",
    "შესაძლოა seja necessário": "pode ser necessário",
    "certo receio, მაინც se maravilha": "certo receio, ainda assim se maravilha",
    "que შეგიძლიათ observar": "que é possível observar",
    "Além disso, կարելի considerar": "Além disso, pode-se considerar",
    "Na համակարգa de coordenadas": "No sistema de coordenadas",
    "Você կարող precisar": "Você pode precisar",
    "em uma ასეთი placa": "em uma placa desse tipo",
    "ამიტომ certifique-se": "portanto, certifique-se",
    "oscilações amortecem-se բավական rapidamente": "oscilações amortecem-se bastante rapidamente",
    "valores բավական grandes": "valores bastante grandes",
    "com os quais դուք construiu": "com os quais você construiu",
    "Bateria de 9 V com conector": "Bateria Krona com conector",
    "utilize SOMENTE a bateria de 9 V": "utilize SOMENTE a bateria Krona",
}
UNEXPECTED_SCRIPT = re.compile(r"[\u0530-\u058f\u10a0-\u10ff\u0600-\u06ff\u4e00-\u9fff]")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", required=True)
    args = parser.parse_args()
    changed = []
    for path in sorted(Path(args.results_dir).glob("*-result.json")):
        parsed = json.loads(path.read_text(encoding="utf-8"))
        applied = []
        for batch_id, raw in parsed.get("batches", {}).items():
            for source, target in REPLACEMENTS.items():
                count = raw.count(source)
                if count:
                    raw = raw.replace(source, target)
                    applied.append({"batch": batch_id, "source": source, "target": target, "count": count})
            if UNEXPECTED_SCRIPT.search(raw):
                raise RuntimeError(f"{path} batch {batch_id}: an unreviewed foreign-script fragment remains")
            parsed["batches"][batch_id] = raw
        if applied:
            parsed.setdefault("repairs", []).extend(applied)
            path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            changed.append({"result": str(path), "repairs": applied})
    print(json.dumps({"status": "clean", "changed": changed, "repair_count": sum(len(item["repairs"]) for item in changed)}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()

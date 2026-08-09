"""Report every malformed prose marker batch before translations are applied."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs-dir", required=True)
    parser.add_argument("--results-dir", required=True)
    args = parser.parse_args()
    failures = []
    jobs = sorted(Path(args.jobs_dir).glob("*-job.json"))
    for job_path in jobs:
        job = json.loads(job_path.read_text(encoding="utf-8"))
        result_path = Path(args.results_dir) / job_path.name.replace("-job.json", "-result.json")
        result = json.loads(result_path.read_text(encoding="utf-8"))
        by_index = {record["index"]: record for record in job["records"]}
        for batch in job["batches"]:
            raw = result.get("batches", {}).get(str(batch["id"]), "")
            batch_failed = False
            for index in batch["records"]:
                record = by_index[index]
                matches = re.findall(rf"ZXQNODE{index:06d}QXZ\s*(.*?)\s*ZXQEND{index:06d}QXZ", raw, re.DOTALL)
                if len(matches) != 1:
                    failures.append({"job": str(job_path), "result": str(result_path), "batch_id": batch["id"], "record": record["key"], "reason": f"record markers: {len(matches)}"})
                    batch_failed = True
                    continue
                expected = [f"ZXQSAFE{value_index:06d}QXZ" for value_index in range(len(record["protected_values"]))]
                found = re.findall(r"ZXQSAFE\d{6}QXZ", matches[0])
                if sorted(found) != expected:
                    failures.append({"job": str(job_path), "result": str(result_path), "batch_id": batch["id"], "record": record["key"], "reason": "protected markers changed", "expected": expected, "found": found})
                    batch_failed = True
            if batch_failed:
                failures[-1]["retry_batch"] = True
    retry_batches = sorted({(failure["job"], failure["result"], failure["batch_id"]) for failure in failures})
    print(json.dumps({
        "status": "valid" if not failures else "retry_required",
        "jobs": len(jobs), "failures": failures,
        "retry_batches": [{"job": job, "result": result, "batch_id": batch_id} for job, result, batch_id in retry_batches],
    }, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

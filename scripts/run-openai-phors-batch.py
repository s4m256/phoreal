"""Prepare, submit and collect economical Batch API pho.rs translations."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


API_ROOT = "https://api.openai.com/v1"
transport_path = Path(__file__).with_name("run-openai-phors-translation.py")
spec = importlib.util.spec_from_file_location("phors_translation_transport", transport_path)
transport = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(transport)


def api_key() -> str:
    value = os.environ.get("OPENAI_API_KEY")
    if not value:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return value


def request_json(url: str, key: str, *, method: str = "GET", body: dict | None = None) -> dict:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API returned HTTP {error.code}: {detail}") from error


def response_body(model: str, instructions: str, text: str) -> dict:
    return {
        "model": model,
        "instructions": instructions,
        "input": text,
        "reasoning": {"effort": "low"},
        "text": {"verbosity": "low"},
        "store": False,
        "max_output_tokens": 12000,
    }


def prepare(args: argparse.Namespace) -> None:
    jobs = sorted(Path(args.jobs_dir).glob("*-job.json"))
    if not jobs:
        raise RuntimeError(f"No *-job.json files found in {args.jobs_dir}")
    requests: list[dict] = []
    entries: dict[str, dict] = {}
    total_input_characters = 0
    for job_path in jobs:
        job = json.loads(job_path.read_text(encoding="utf-8"))
        slug = job_path.stem.removesuffix("-job")
        for batch in job["batches"]:
            custom_id = f"prose:{slug}:{batch['id']}"
            requests.append({
                "custom_id": custom_id,
                "method": "POST",
                "url": "/v1/responses",
                "body": response_body(args.model, transport.PROSE_INSTRUCTIONS, batch["text"]),
            })
            entries[custom_id] = {"job": str(job_path), "kind": "prose", "batch_id": batch["id"]}
            total_input_characters += len(batch["text"])
        values = transport.math_values(job)
        for batch_id, batch in enumerate(transport.make_math_batches(values)):
            custom_id = f"math:{slug}:{batch_id}"
            text = "\n".join(line for _index, line in batch)
            requests.append({
                "custom_id": custom_id,
                "method": "POST",
                "url": "/v1/responses",
                "body": response_body(args.model, transport.MATH_INSTRUCTIONS, text),
            })
            entries[custom_id] = {
                "job": str(job_path), "kind": "math", "batch_id": batch_id,
                "values": [{"index": index, "source": values[index]} for index, _line in batch],
            }
            total_input_characters += len(text)
    request_path = Path(args.request_file)
    request_path.parent.mkdir(parents=True, exist_ok=True)
    request_path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in requests), encoding="utf-8")
    manifest = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": args.model,
        "jobs": [str(path) for path in jobs],
        "request_file": str(request_path),
        "entries": entries,
    }
    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "prepared", "jobs": len(jobs), "requests": len(requests),
        "inputCharacters": total_input_characters, "requestBytes": request_path.stat().st_size,
        "manifest": str(manifest_path),
    }, ensure_ascii=False, indent=2))


def upload_file(path: Path, key: str) -> dict:
    boundary = f"----phors-{uuid.uuid4().hex}"
    file_bytes = path.read_bytes()
    pieces = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nbatch\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\nContent-Type: application/jsonl\r\n\r\n".encode(),
        file_bytes,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    request = urllib.request.Request(
        f"{API_ROOT}/files",
        data=b"".join(pieces),
        headers={"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI file upload returned HTTP {error.code}: {detail}") from error


def submit(args: argparse.Namespace) -> None:
    key = api_key()
    uploaded = upload_file(Path(args.request_file), key)
    batch = request_json(f"{API_ROOT}/batches", key, method="POST", body={
        "input_file_id": uploaded["id"],
        "endpoint": "/v1/responses",
        "completion_window": "24h",
        "metadata": {"purpose": "phors-xy-ptbr", "model": args.model},
    })
    state = {"schema_version": 1, "request_file": args.request_file, "manifest": args.manifest, "uploaded_file": uploaded, "batch": batch}
    state_path = Path(args.state)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": batch["status"], "batch_id": batch["id"], "requests": batch.get("request_counts"), "state": str(state_path)}, ensure_ascii=False, indent=2))


def get_batch(state_path: Path) -> tuple[dict, dict]:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    batch = request_json(f"{API_ROOT}/batches/{state['batch']['id']}", api_key())
    return state, batch


def status(args: argparse.Namespace) -> None:
    _state, batch = get_batch(Path(args.state))
    print(json.dumps({
        "batch_id": batch["id"], "status": batch["status"], "request_counts": batch.get("request_counts"),
        "usage": batch.get("usage"), "output_file_id": batch.get("output_file_id"), "error_file_id": batch.get("error_file_id"),
    }, ensure_ascii=False, indent=2))


def download_file(file_id: str, key: str) -> bytes:
    request = urllib.request.Request(f"{API_ROOT}/files/{file_id}/content", headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def collect(args: argparse.Namespace) -> None:
    state, batch = get_batch(Path(args.state))
    if batch["status"] != "completed":
        raise RuntimeError(f"Batch is {batch['status']}, not completed")
    key = api_key()
    raw = download_file(batch["output_file_id"], key)
    output_jsonl = Path(args.output_jsonl)
    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    output_jsonl.write_bytes(raw)
    manifest = json.loads(Path(state["manifest"]).read_text(encoding="utf-8"))
    by_job: dict[str, dict] = {
        job: {"batches": {}, "math_translations": {}, "requests": []}
        for job in manifest["jobs"]
    }
    failures = []
    for line in raw.decode("utf-8").splitlines():
        item = json.loads(line)
        entry = manifest["entries"][item["custom_id"]]
        response = item.get("response")
        if item.get("error") or not response or response.get("status_code") != 200:
            failures.append({"custom_id": item["custom_id"], "error": item.get("error"), "response": response})
            continue
        body = response["body"]
        text = transport.response_text(body)
        destination = by_job[entry["job"]]
        if entry["kind"] == "prose":
            destination["batches"][str(entry["batch_id"])] = text
        else:
            batch_markers = [(value["index"], "") for value in entry["values"]]
            parsed = transport.parse_math_batch(text, batch_markers)
            for value in entry["values"]:
                destination["math_translations"][value["source"]] = parsed[value["index"]]
        destination["requests"].append({
            "custom_id": item["custom_id"], "response_id": body.get("id"),
            "model": body.get("model"), "usage": body.get("usage", {}),
        })
    if failures:
        raise RuntimeError(f"{len(failures)} batch requests failed; inspect {output_jsonl}")
    results_dir = Path(args.results_dir)
    results_dir.mkdir(parents=True, exist_ok=True)
    for job_path, result in by_job.items():
        result.update({
            "schema_version": 1,
            "engine": f"OpenAI Batch Responses API / {manifest['model']} / reasoning low",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "job": job_path,
        })
        name = Path(job_path).name.replace("-job.json", "-result.json")
        (results_dir / name).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "collected_review_required", "jobs": len(by_job), "results_dir": str(results_dir), "usage": batch.get("usage")}, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--jobs-dir", required=True)
    prepare_parser.add_argument("--request-file", required=True)
    prepare_parser.add_argument("--manifest", required=True)
    prepare_parser.add_argument("--model", default="gpt-5.6-terra")
    prepare_parser.set_defaults(run=prepare)
    submit_parser = subparsers.add_parser("submit")
    submit_parser.add_argument("--request-file", required=True)
    submit_parser.add_argument("--manifest", required=True)
    submit_parser.add_argument("--state", required=True)
    submit_parser.add_argument("--model", default="gpt-5.6-terra")
    submit_parser.set_defaults(run=submit)
    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--state", required=True)
    status_parser.set_defaults(run=status)
    collect_parser = subparsers.add_parser("collect")
    collect_parser.add_argument("--state", required=True)
    collect_parser.add_argument("--output-jsonl", required=True)
    collect_parser.add_argument("--results-dir", required=True)
    collect_parser.set_defaults(run=collect)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()

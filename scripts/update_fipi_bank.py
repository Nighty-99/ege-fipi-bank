"""Incrementally synchronize a static catalog with the open FIPI bank."""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server import FIPI, PROJECT, FipiClient, clean_text, parse_tasks  # noqa: E402

DATA_FILE = ROOT / "data" / "tasks.json"
TAXONOMY_FILE = ROOT / "data" / "taxonomy.json"
PAGE_SIZE = 100


def fingerprint(task: dict) -> str:
    text = re.sub(r"\s+", " ", clean_text(task["prompt"])).strip().casefold()
    return hashlib.sha256(text.encode()).hexdigest()


def kes_code(task: dict) -> str:
    match = re.match(r"(\d+(?:\.\d+)?)", task.get("subtopic", ""))
    return match.group(1) if match else ""


def classify_detailed(task: dict) -> tuple[int | None, str]:
    code = kes_code(task)
    text = f'{task.get("subtopic", "")} {clean_text(task.get("prompt", ""))}'.casefold()
    if code == "2.10" or (code == "3.1" and re.search(r"значени[яй]\s+.{0,20}a|параметр", text)): return 18, "kes_or_keyword"
    if code in {"2.5", "2.6", "2.7", "2.8", "2.9"}: return 15, "kes"
    if code in {"7.2", "7.3", "7.4"}: return 14, "kes"
    if code == "7.1": return 16, "kes"
    if code in {"1.5", "2.1", "2.2", "2.3", "2.4"}: return 13, "kes"
    if re.search(r"кредит|вклад|банк|плат[её]ж|рубл|прибыл|бизнес|акци", text): return 17, "keyword"
    if code in {"1.1", "1.2", "1.7"} or re.search(r"делим|целых|натуральн", text): return 19, "kes_or_keyword"
    return None, "needs_review"


def classify(task: dict) -> tuple[int | None, str]:
    if not task.get("has_short_answer"):
        return classify_detailed(task)
    code = kes_code(task)
    text = clean_text(task["prompt"])
    if re.search(r"поезд|автомоб|лодк|катер|велосипед|пешеход|рабоч|заказ|смес|сплав|раствор|производител|вклад|труб|бассейн", text, re.I):
        return 10, "keyword"
    if re.search(r"формул|температур|давлен|мощност|напряжен|скорост|высот|энерги|фокусн|сопротивлен", text, re.I):
        return 9, "keyword"
    if code == "7.1": return 1, "kes"
    if code == "7.5": return 2, "kes"
    if code in {"7.2", "7.3", "7.4"}: return 3, "kes"
    if code in {"6.2", "6.3"}:
        advanced = re.search(r"независим|несколько|хотя бы|по крайней мере|не менее|не более|условн|бернул", clean_text(task["prompt"]), re.I)
        return (5 if advanced else 4), "keyword"
    if code in {"2.1", "2.2", "2.3", "2.4"}: return 6, "kes"
    if code in {"4.1", "4.3"}: return 8, "kes"
    if code == "4.2": return 12, "kes"
    if code.startswith("3"): return 11, "kes"
    if code.startswith("1"): return 7, "kes"
    return None, "needs_review"


def fetch_all() -> tuple[list[dict], int]:
    client = FipiClient()
    payload = {
        "search": "1", "pagesize": str(PAGE_SIZE), "proj": PROJECT,
        "theme": "", "qlevel": "", "qkind": "", "qsstruct": "",
        "qpos": "", "qid": "", "zid": "", "solved": "",
        "favorite": "", "blind": "",
    }
    first = client._request(f"{FIPI}questions.php", payload).decode("windows-1251", "replace")
    counts = re.findall(r"setQCount\((\d+)\)", first)
    expected = int(counts[-1]) if counts else 0
    tasks = parse_tasks(first)
    # В URL ФИПИ страницы нумеруются с нуля: первая выборка уже содержит page=0.
    for page_offset in range(1, math.ceil(expected / PAGE_SIZE)):
        url = f"{FIPI}questions.php?proj={PROJECT}&page={page_offset}&pagesize={PAGE_SIZE}"
        tasks.extend(parse_tasks(client._request(url).decode("windows-1251", "replace")))
    return list({task["guid"]: task for task in tasks}.values()), expected


def load_existing() -> dict:
    if not DATA_FILE.exists():
        return {"schema_version": 1, "tasks": []}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def main() -> None:
    fetched, expected = fetch_all()
    database = load_existing()
    existing = {task["guid"]: task for task in database.get("tasks", [])}
    added = changed = 0
    now = datetime.now(timezone.utc).isoformat()
    for raw in fetched:
        digest = fingerprint(raw)
        old = existing.get(raw["guid"])
        topic_id, method = classify(raw)
        record = {
            "guid": raw["guid"], "number": raw["number"], "fingerprint": digest,
            "prompt": raw["prompt"], "subtopic": raw["subtopic"],
            "answer_type": raw["answer_type"], "has_short_answer": raw["has_short_answer"],
            "topic_id": topic_id, "classification": method, "answers": [],
            "answer_status": "needs_solution" if raw["has_short_answer"] else "not_applicable",
            "source_url": raw["source_url"], "first_seen_at": now, "updated_at": now,
        }
        if old:
            record["answers"] = old.get("answers", [])
            record["answer_status"] = old.get("answer_status", record["answer_status"])
            record["first_seen_at"] = old.get("first_seen_at", now)
            if old.get("classification") == "manual":
                record["topic_id"], record["classification"] = old.get("topic_id"), "manual"
            if old.get("fingerprint") == digest:
                record["updated_at"] = old.get("updated_at", now)
            else:
                changed += 1
        else:
            added += 1
        existing[raw["guid"]] = record
    database.update({
        "schema_version": 1, "project": PROJECT, "source_count": expected,
        "parsed_count": len(fetched), "updated_at": now,
        "tasks": sorted(existing.values(), key=lambda item: item["number"]),
    })
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(database, ensure_ascii=False, indent=2), encoding="utf-8")
    official_taxonomy = FipiClient().load_taxonomy()
    for item in official_taxonomy:
        item["topic_ids"] = sorted({
            task["topic_id"] for task in database["tasks"]
            if task.get("topic_id") and task.get("subtopic", "").startswith(item["code"] + " ")
        })
    TAXONOMY_FILE.write_text(
        json.dumps({"updated_at": now, "items": official_taxonomy}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    review = sum(task.get("topic_id") is None for task in database["tasks"])
    print(f"FIPI={expected}; parsed={len(fetched)}; added={added}; changed={changed}; review={review}")
    if expected and len(fetched) != expected:
        raise SystemExit("Not all FIPI tasks were parsed; publication stopped")


if __name__ == "__main__":
    main()

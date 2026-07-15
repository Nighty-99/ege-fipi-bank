"""Verify one reasoned answer through FIPI and save it for GitHub Pages."""

from __future__ import annotations
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import FIPI, PROJECT, FipiClient, parse_tasks  # noqa: E402

TASKS_FILE = ROOT / "data" / "tasks.json"
ANSWERS_FILE = ROOT / "data" / "answers.json"


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/verify_answer.py FIPI_NUMBER ANSWER [ANSWER_VARIANT ...]")
    number, variants = sys.argv[1], sys.argv[2:]
    database = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
    task = next((item for item in database["tasks"] if item["number"].casefold() == number.casefold()), None)
    if not task:
        raise SystemExit(f"Task {number} is absent from data/tasks.json")
    if not task["has_short_answer"]:
        raise SystemExit("FIPI marks this task as a detailed-answer task")
    client = FipiClient()
    # Некоторые карточки создают анонимного пользователя только после визита
    # на главную страницу банка; без этого solve.php отвечает «пользователь не определён».
    client._request(f"{FIPI}index.php?proj={PROJECT}")
    client._request(f"{FIPI}questions.php?proj={PROJECT}&init_filter_themes=1")
    code_match = re.match(r"(\d+(?:\.\d+)?)", task["subtopic"])
    payload = {
        "search": "1", "pagesize": "100", "proj": PROJECT, "qid": "",
        "theme": code_match.group(1) if code_match else "", "qlevel": "", "qkind": "", "qsstruct": "", "qpos": "",
        "zid": "", "solved": "", "favorite": "", "blind": "",
    }
    page = client._request(f"{FIPI}questions.php", payload).decode("windows-1251", "replace")
    loaded = parse_tasks(page)
    count_match = re.findall(r"setQCount\((\d+)\)", page)
    count = int(count_match[-1]) if count_match else len(loaded)
    for offset in range(1, math.ceil(count / 100)):
        if any(item["guid"] == task["guid"] for item in loaded):
            break
        url = f"{FIPI}questions.php?proj={PROJECT}&page={offset}&pagesize=100"
        loaded.extend(parse_tasks(client._request(url).decode("windows-1251", "replace")))
    if not any(item["guid"] == task["guid"] for item in loaded):
        raise SystemExit("FIPI did not return the requested GUID; answer was not saved")
    client.loaded_guids.add(task["guid"])
    if not client.check(task["guid"], variants[0]):
        raise SystemExit("FIPI status: incorrect; answer was not saved")
    answers = json.loads(ANSWERS_FILE.read_text(encoding="utf-8")) if ANSWERS_FILE.exists() else {}
    answers[task["guid"]] = {
        "number": task["number"], "answers": variants,
        "status": "verified_fipi", "verified_at": datetime.now(timezone.utc).date().isoformat(),
    }
    ANSWERS_FILE.write_text(json.dumps(answers, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f'{task["number"]}: verified and saved ({", ".join(variants)})')


if __name__ == "__main__":
    main()

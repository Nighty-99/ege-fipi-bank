"""Record a manually solved answer when FIPI validation is unavailable."""

from __future__ import annotations
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASKS_FILE = ROOT / "data" / "tasks.json"
ANSWERS_FILE = ROOT / "data" / "answers.json"


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/record_calculated_answer.py FIPI_NUMBER ANSWER [ANSWER_VARIANT ...]")
    number, variants = sys.argv[1], sys.argv[2:]
    tasks = json.loads(TASKS_FILE.read_text(encoding="utf-8"))["tasks"]
    task = next((item for item in tasks if item["number"].casefold() == number.casefold()), None)
    if not task or not task["has_short_answer"]:
        raise SystemExit("Unknown task or detailed-answer task")
    bank = json.loads(ANSWERS_FILE.read_text(encoding="utf-8"))
    bank[task["guid"]] = {
        "number": task["number"], "answers": variants,
        "status": "calculated_fipi_check_unavailable",
        "verified_at": datetime.now(timezone.utc).date().isoformat(),
    }
    ANSWERS_FILE.write_text(json.dumps(bank, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f'{task["number"]}: calculated answer saved ({", ".join(variants)})')


if __name__ == "__main__":
    main()

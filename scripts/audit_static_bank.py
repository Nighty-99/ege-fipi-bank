from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASKS_FILE = ROOT / "data" / "tasks.json"
ANSWERS_FILE = ROOT / "data" / "answers.json"

IMG_SRC_RE = re.compile(r"<img\b[^>]*?\bsrc=[\"']([^\"']+)[\"']", re.IGNORECASE)
INLINE_IMG_RE = re.compile(r"<img\b[^>]*\bfipi-inline-image\b[^>]*>", re.IGNORECASE)
BLOCK_IMG_RE = re.compile(r"<img\b[^>]*\bfipi-block-image\b[^>]*>", re.IGNORECASE)
INLINE_BEFORE_BLOCK_RE = re.compile(
    r"((?:\s*<img\b[^>]*\bfipi-inline-image\b[^>]*>)+)\s*<img\b[^>]*\bfipi-block-image\b[^>]*>",
    re.IGNORECASE,
)
TRAILING_INLINE_RE = re.compile(
    r"((?:\s*<img\b[^>]*\bfipi-inline-image\b[^>]*>)+)\s*$",
    re.IGNORECASE,
)


def main() -> None:
    database = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
    answers = json.loads(ANSWERS_FILE.read_text(encoding="utf-8")) if ANSWERS_FILE.exists() else {}
    tasks = database["tasks"]
    task_guids = {task["guid"] for task in tasks}

    prompts_by_task = [task.get("prompt") or "" for task in tasks]
    prompts = "\n".join(prompts_by_task)
    image_sources = IMG_SRC_RE.findall(prompts)
    local_images = [src for src in image_sources if not src.startswith(("http://", "https://", "data:"))]
    external_images = [src for src in image_sources if src.startswith(("http://", "https://"))]
    missing_images = [src for src in local_images if not (ROOT / src).exists()]
    empty_images = [src for src in local_images if (ROOT / src).exists() and (ROOT / src).stat().st_size == 0]

    short_tasks = [task for task in tasks if task.get("has_short_answer")]
    missing_short_answers = [
        task for task in short_tasks
        if not answers.get(task["guid"], {}).get("answers")
    ]
    orphan_answers = [guid for guid in answers if guid not in task_guids]

    topics = Counter(task.get("topic_id") for task in tasks)
    missing_answer_topics = Counter(task.get("topic_id") for task in missing_short_answers)
    answer_statuses = Counter(value.get("status") for value in answers.values())

    print("=== FIPI static bank audit ===")
    print(f"tasks_total: {len(tasks)}")
    print(f"source_count: {database.get('source_count')}")
    print(f"parsed_count: {database.get('parsed_count')}")
    print(f"short_tasks: {len(short_tasks)}")
    print(f"answers_total: {len(answers)}")
    print(f"missing_short_answers: {len(missing_short_answers)}")
    print(f"orphan_answers: {len(orphan_answers)}")
    print(f"image_refs: {len(image_sources)}")
    print(f"local_image_refs: {len(local_images)}")
    print(f"external_image_refs: {len(external_images)}")
    print(f"missing_image_files: {len(missing_images)}")
    print(f"empty_image_files: {len(empty_images)}")
    print(f"inline_images: {len(INLINE_IMG_RE.findall(prompts))}")
    print(f"block_images: {len(BLOCK_IMG_RE.findall(prompts))}")
    inline_before_block_runs = sum(len(INLINE_BEFORE_BLOCK_RE.findall(prompt)) for prompt in prompts_by_task)
    trailing_inline_runs = sum(1 for prompt in prompts_by_task if TRAILING_INLINE_RE.search(prompt))
    print(f"inline_before_block_runs: {inline_before_block_runs}")
    print(f"trailing_inline_runs: {trailing_inline_runs}")
    print(f"tasks_by_topic: {dict(sorted(topics.items()))}")
    print(f"answer_statuses: {dict(answer_statuses)}")

    if missing_answer_topics:
        print(f"missing_short_answers_by_topic: {dict(sorted(missing_answer_topics.items()))}")
        print("missing_short_answer_numbers:")
        for task in missing_short_answers:
            print(f"  {task.get('number')} topic={task.get('topic_id')} subtopic={task.get('subtopic')}")

    if external_images[:10]:
        print("external_image_sample:")
        for src in external_images[:10]:
            print(f"  {src}")

    if missing_images[:10]:
        print("missing_image_sample:")
        for src in missing_images[:10]:
            print(f"  {src}")

    failed = any([
        orphan_answers,
        external_images,
        missing_images,
        empty_images,
        inline_before_block_runs,
        trailing_inline_runs,
    ])
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

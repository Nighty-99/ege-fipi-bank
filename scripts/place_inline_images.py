from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASKS_FILE = ROOT / "data" / "tasks.json"

INLINE_IMG_RE = re.compile(r"<img\b[^>]*\bfipi-inline-image\b[^>]*>", re.IGNORECASE)
TRAILING_INLINE_IMAGES_RE = re.compile(
    r"((?:\s*<img\b[^>]*\bfipi-inline-image\b[^>]*>)+)\s*$",
    re.IGNORECASE,
)
INLINE_IMAGES_BEFORE_BLOCK_RE = re.compile(
    r"((?:\s*<img\b[^>]*\bfipi-inline-image\b[^>]*>)+)\s*(<img\b[^>]*\bfipi-block-image\b[^>]*>)",
    re.IGNORECASE,
)
EMPTY_SPAN_RE = re.compile(
    r"<span\b[^>]*>\s*(?:&nbsp;|\u00a0|\s)*</span>",
    re.IGNORECASE,
)
EMPTY_SUB_RE = re.compile(
    r"<sub\b[^>]*>\s*(?:&nbsp;|\u00a0|\s)*</sub>",
    re.IGNORECASE,
)
PLACEHOLDER_RE = re.compile(
    r"<span\b[^>]*>\s*(?:&nbsp;|\u00a0|\s)*</span>|<sub\b[^>]*>\s*(?:&nbsp;|\u00a0|\s)*</sub>",
    re.IGNORECASE,
)


def place_trailing_inline_images(prompt: str) -> tuple[str, int]:
    trailing = TRAILING_INLINE_IMAGES_RE.search(prompt)
    if not trailing:
        return prompt, 0

    images = INLINE_IMG_RE.findall(trailing.group(1))
    if not images:
        return prompt, 0

    body = prompt[: trailing.start()]
    placeholders = list(PLACEHOLDER_RE.finditer(body))
    if len(placeholders) < len(images):
        return prompt, 0

    image_iter = iter(images)
    placed = 0

    def replace_span(match: re.Match[str]) -> str:
        nonlocal placed
        if placed >= len(images):
            return match.group(0)
        placed += 1
        return next(image_iter)

    body = PLACEHOLDER_RE.sub(replace_span, body, count=len(images))
    return body, placed


def place_inline_images_before_block(prompt: str) -> tuple[str, int]:
    placed_total = 0

    while True:
        match = INLINE_IMAGES_BEFORE_BLOCK_RE.search(prompt)
        if not match:
            return prompt, placed_total

        images = INLINE_IMG_RE.findall(match.group(1))
        if not images:
            return prompt, placed_total

        before = prompt[: match.start()]
        after = prompt[match.end() :]
        block_image = match.group(2)
        placeholders = list(PLACEHOLDER_RE.finditer(before))
        if len(placeholders) < len(images):
            return prompt, placed_total

        image_iter = iter(images)
        placed = 0

        def replace_placeholder(span_match: re.Match[str]) -> str:
            nonlocal placed
            if placed >= len(images):
                return span_match.group(0)
            placed += 1
            return next(image_iter)

        before = PLACEHOLDER_RE.sub(replace_placeholder, before, count=len(images))
        prompt = before + block_image + after
        placed_total += placed


def main() -> None:
    database = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
    changed_tasks = []
    placed_total = 0

    for task in database["tasks"]:
        prompt = task.get("prompt") or ""
        updated, placed = place_trailing_inline_images(prompt)
        if not placed:
            updated, placed = place_inline_images_before_block(prompt)
        if placed:
            task["prompt"] = updated
            changed_tasks.append((task.get("number"), placed))
            placed_total += placed

    TASKS_FILE.write_text(json.dumps(database, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"changed tasks: {len(changed_tasks)}")
    print(f"placed images: {placed_total}")
    for number, placed in changed_tasks:
        print(f"{number}: {placed}")


if __name__ == "__main__":
    main()

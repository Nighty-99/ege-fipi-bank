from __future__ import annotations

import json
import re
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASKS_FILE = ROOT / "data" / "tasks.json"

IMG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
SRC_RE = re.compile(r"\bsrc=([\"'])(.*?)\1", re.IGNORECASE)
CLASS_RE = re.compile(r"\bclass=([\"'])(.*?)\1", re.IGNORECASE)


def image_size(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()[:32]
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", data[6:10])
    if data.startswith(b"\xff\xd8"):
        # JPEG images are not expected in this bank, but leave them as block
        # images rather than risking a broken inline formula guess.
        return None
    return None


def is_inline_formula(width: int, height: int) -> bool:
    return height <= 70 and width <= 240


def with_class(tag: str, class_name: str) -> str:
    match = CLASS_RE.search(tag)
    if match:
        quote, value = match.groups()
        classes = [item for item in value.split() if item not in {"fipi-inline-image", "fipi-block-image"}]
        if class_name not in classes:
            classes.append(class_name)
        return tag[: match.start(2)] + " ".join(classes) + tag[match.end(2) :]
    return tag[:-1] + f' class="{class_name}">'


def classify_tag(tag: str) -> tuple[str, str | None]:
    src_match = SRC_RE.search(tag)
    if not src_match:
        return tag, None
    src = src_match.group(2)
    if src.startswith(("http://", "https://", "data:")):
        return with_class(tag, "fipi-block-image"), "block"

    path = ROOT / src
    size = image_size(path) if path.exists() else None
    if not size:
        return with_class(tag, "fipi-block-image"), "block"

    width, height = size
    kind = "inline" if is_inline_formula(width, height) else "block"
    return with_class(tag, f"fipi-{kind}-image"), kind


def main() -> None:
    database = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
    counts = {"inline": 0, "block": 0}

    for task in database["tasks"]:
        prompt = task.get("prompt") or ""

        def replace(match: re.Match[str]) -> str:
            tag, kind = classify_tag(match.group(0))
            if kind:
                counts[kind] += 1
            return tag

        task["prompt"] = IMG_RE.sub(replace, prompt)

    TASKS_FILE.write_text(json.dumps(database, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"inline images: {counts['inline']}")
    print(f"block images: {counts['block']}")
    print(f"updated: {TASKS_FILE.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()

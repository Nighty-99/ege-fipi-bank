from __future__ import annotations

import argparse
import json
import mimetypes
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASKS_FILE = ROOT / "data" / "tasks.json"
IMAGE_DIR = ROOT / "assets" / "fipi-images"

IMG_SRC_RE = re.compile(r"(<img\b[^>]*?\bsrc=)([\"'])(.*?)(\2)", re.IGNORECASE)


def image_extension(url: str, content_type: str | None = None) -> str:
    path = urllib.parse.urlparse(url).path
    suffix = Path(path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        return suffix
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";", 1)[0].strip())
        if guessed:
            return ".jpg" if guessed == ".jpe" else guessed
    return ".png"


def is_external_fipi_image(src: str) -> bool:
    return src.startswith("https://ege.fipi.ru/") or src.startswith("http://ege.fipi.ru/")


def unique_path(path: Path, used: set[Path]) -> Path:
    if path not in used and not path.exists():
        used.add(path)
        return path
    stem, suffix = path.stem, path.suffix
    counter = 2
    while True:
        candidate = path.with_name(f"{stem}-{counter}{suffix}")
        if candidate not in used and not candidate.exists():
            used.add(candidate)
            return candidate
        counter += 1


def download(url: str, target: Path, retries: int = 3) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        return

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; Infinita-FIPI-Bank/1.0)",
            "Referer": "https://ege.fipi.ru/",
        },
    )

    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read()
                if not data:
                    raise RuntimeError("empty response")
                target.write_bytes(data)
                return
        except (urllib.error.URLError, TimeoutError, RuntimeError) as error:
            last_error = error
            if attempt < retries:
                time.sleep(1.5 * attempt)

    raise RuntimeError(f"failed to download {url}: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download FIPI task images and rewrite task prompts to local paths.")
    parser.add_argument("--dry-run", action="store_true", help="Only show planned changes.")
    parser.add_argument("--no-download", action="store_true", help="Rewrite paths without downloading files.")
    args = parser.parse_args()

    database = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
    tasks = database["tasks"]
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    url_to_local: dict[str, str] = {}
    used_paths: set[Path] = set()
    planned_downloads: list[tuple[str, Path]] = []
    replacements = 0

    for task in tasks:
        for src in re.findall(r"<img\b[^>]*?\bsrc=[\"']([^\"']+)[\"']", task.get("prompt") or "", re.IGNORECASE):
            if not src.startswith(("http://", "https://", "data:")):
                used_paths.add((ROOT / src).resolve())

    for task in tasks:
        prompt = task.get("prompt") or ""
        number = task.get("number") or task.get("guid", "task")
        image_index = 0

        def replace(match: re.Match[str]) -> str:
            nonlocal image_index, replacements
            prefix, quote, src, closing_quote = match.groups()
            if not is_external_fipi_image(src):
                return match.group(0)

            image_index += 1
            if src not in url_to_local:
                ext = image_extension(src)
                local_path = unique_path((IMAGE_DIR / f"{number}-{image_index}{ext}").resolve(), used_paths)
                local_src = local_path.relative_to(ROOT).as_posix()
                url_to_local[src] = local_src
                planned_downloads.append((src, local_path))

            replacements += 1
            return f"{prefix}{quote}{url_to_local[src]}{closing_quote}"

        task["prompt"] = IMG_SRC_RE.sub(replace, prompt)

    print(f"tasks: {len(tasks)}")
    print(f"image replacements: {replacements}")
    print(f"unique images: {len(url_to_local)}")
    print(f"downloads planned: {len(planned_downloads)}")

    if args.dry_run:
        for url, path in planned_downloads[:10]:
            print(f"{url} -> {path.relative_to(ROOT).as_posix()}")
        return

    if not args.no_download:
        for index, (url, path) in enumerate(planned_downloads, start=1):
            download(url, path)
            print(f"[{index}/{len(planned_downloads)}] {path.relative_to(ROOT).as_posix()}")

    TASKS_FILE.write_text(
        json.dumps(database, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"updated: {TASKS_FILE.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()

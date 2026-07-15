from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(script: str, *args: str) -> None:
    command = [sys.executable, str(ROOT / "scripts" / script), *args]
    print("\n>>> " + " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Update the static FIPI bank for GitHub Pages: fetch tasks, "
            "localize images, classify inline formulas, place them in text, and audit the result."
        )
    )
    parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="Do not request the FIPI bank; only post-process the current data/tasks.json.",
    )
    parser.add_argument(
        "--skip-image-download",
        action="store_true",
        help="Rewrite image paths without downloading files. Useful only for diagnostics.",
    )
    args = parser.parse_args()

    if not args.skip_fetch:
        run("update_fipi_bank.py")

    localize_args = ["--no-download"] if args.skip_image_download else []
    run("localize_fipi_images.py", *localize_args)
    run("classify_task_images.py")
    run("place_inline_images.py")
    run("audit_static_bank.py")

    print("\nUpdate pipeline finished.")
    print("If audit reports missing short answers, solve only the listed new tasks and save them with:")
    print("  python scripts\\verify_answer.py FIPI_NUMBER ANSWER")
    print("or, when FIPI check is unavailable:")
    print("  python scripts\\record_calculated_answer.py FIPI_NUMBER ANSWER")


if __name__ == "__main__":
    main()

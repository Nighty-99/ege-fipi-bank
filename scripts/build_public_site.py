"""Build a clean public GitHub Pages bundle.

This script copies only the files that must be visible in the public
repository. Working scripts, local experiments, server files, caches and
temporary folders stay in the private/work repository.

Usage:
    python scripts/build_public_site.py
    python scripts/build_public_site.py --output C:\path\to\public-repo
    python scripts/build_public_site.py --cname bank.infinita-school.ru
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

FILES = [
    ".nojekyll",
    "index.html",
    "app.js",
    "styles.css",
    "taxonomy.html",
    "taxonomy.js",
    "taxonomy.css",
    "tilda-embed-snippet.html",
]

DIRECTORIES = [
    "data",
    "assets/fipi-images",
]


def remove_public_contents(output: Path) -> None:
    """Clean output directory, preserving a nested Git repository if present."""

    output.mkdir(parents=True, exist_ok=True)
    for item in output.iterdir():
        if item.name == ".git":
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()


def copy_file(relative_path: str, output: Path) -> None:
    source = ROOT / relative_path
    destination = output / relative_path
    if not source.exists():
        raise FileNotFoundError(f"Required file is missing: {relative_path}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def copy_directory(relative_path: str, output: Path) -> None:
    source = ROOT / relative_path
    destination = output / relative_path
    if not source.exists():
        raise FileNotFoundError(f"Required directory is missing: {relative_path}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination)


def write_public_readme(output: Path) -> None:
    readme = output / "README.md"
    readme.write_text(
        "# Банк заданий ЕГЭ ФИПИ — Infinita\n\n"
        "Это публичная статическая сборка для GitHub Pages и встраивания в Tilda.\n\n"
        "Материалы заданий получены из открытого банка ФГБНУ «ФИПИ».\n",
        encoding="utf-8",
    )


def write_cname(output: Path, domain: str | None) -> None:
    if not domain:
        return
    normalized_domain = domain.strip().removeprefix("https://").removeprefix("http://").strip("/")
    if not normalized_domain:
        raise ValueError("CNAME domain is empty.")
    (output / "CNAME").write_text(f"{normalized_domain}\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="public-site",
        help="Output directory. It may be a separate cloned public repository.",
    )
    parser.add_argument(
        "--cname",
        default="",
        help="Optional custom domain for GitHub Pages, for example bank.infinita-school.ru.",
    )
    args = parser.parse_args()

    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output
    output = output.resolve()

    if output == ROOT:
        raise SystemExit("Refusing to build into the project root.")

    remove_public_contents(output)

    for relative_path in FILES:
        copy_file(relative_path, output)
    for relative_path in DIRECTORIES:
        copy_directory(relative_path, output)

    write_public_readme(output)
    write_cname(output, args.cname)

    print(f"Public site bundle is ready: {output}")
    print("Files copied:")
    for relative_path in FILES + DIRECTORIES:
        print(f"  - {relative_path}")


if __name__ == "__main__":
    main()

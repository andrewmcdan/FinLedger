#!/usr/bin/env python3
import argparse
import re
import subprocess
import sys
from collections import defaultdict

PKG_LINE_RE = re.compile(
    r"""^\s*
    (?P<pkg>[@A-Za-z0-9._\-\/]+)
    @
    (?P<ver>[0-9A-Za-z.\-+~^_]+)
    \s+\[license\(s\):\s*
    (?P<lic>.+?)
    \s*\]\s*$
    """,
    re.VERBOSE,
)

def normalize_license(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())

import subprocess
import sys

def run_cmd(cmd):
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
            shell=False,
        )
        return proc.stdout
    except FileNotFoundError:
        return None
    except subprocess.CalledProcessError as e:
        sys.exit(f"ERROR: command failed: {' '.join(cmd)}\n{e.stderr}")

def get_nlf_output() -> str:
    # 1) Try direct invocation
    out = run_cmd(["nlf"])
    if out is not None:
        return out

    # 2) Windows global installs often expose nlf as nlf.cmd
    out = run_cmd(["nlf.cmd"])
    if out is not None:
        return out

    # 3) Fallback to npx (most reliable)
    out = run_cmd(["npx", "-y", "nlf"])
    if out is not None:
        return out

    sys.exit(
        "ERROR: Could not run nlf.\n"
        "Tried: nlf, nlf.cmd, and npx -y nlf\n"
        "Fix: ensure Node/npm are installed and available in PATH."
    )


def parse_licenses_text(text: str):
    """
    Returns:
      single_license: dict[license -> set[pkg@ver]]
      multi_license: dict[pkg@ver -> list[licenses]]
    """
    single_license = defaultdict(set)
    multi_license = {}

    for line in text.splitlines():
        m = PKG_LINE_RE.match(line)
        if not m:
            continue

        pkg = f"{m.group('pkg')}@{m.group('ver')}"
        licenses = [
            normalize_license(x)
            for x in m.group("lic").split(",")
            if x.strip()
        ]

        if len(licenses) == 1:
            single_license[licenses[0]].add(pkg)
        else:
            multi_license[pkg] = licenses

    return single_license, multi_license

def md_escape(text: str) -> str:
    return text.replace("<", "&lt;").replace(">", "&gt;")

def generate_markdown(single_license, multi_license, project_name=None) -> str:
    lines = []

    title = f"# Third-Party Notices for {project_name}" if project_name else "# Third-Party Notices"
    lines.append(title)
    lines.append("")
    lines.append(
        "This project includes open source software packages. "
        "The following attributions are organized by license. "
        "Packages with multiple licenses are noted explicitly."
    )
    lines.append("")

    # Summary
    lines.append("## License Summary")
    lines.append("")
    lines.append("| Category | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Single-license packages | {sum(len(v) for v in single_license.values())} |")
    lines.append(f"| Multi-license (OR) packages | {len(multi_license)} |")
    lines.append("")

    # Single-license sections
    lines.append("## Single-License Packages")
    lines.append("")
    for lic in sorted(single_license.keys(), key=str.lower):
        lines.append(f"### {md_escape(lic)}")
        lines.append("")
        for pkg in sorted(single_license[lic], key=str.lower):
            lines.append(f"- {md_escape(pkg)}")
        lines.append("")

    # Multi-license section
    if multi_license:
        lines.append("## Multi-License Packages (OR)")
        lines.append("")
        lines.append(
            "The following packages are dual- or multi-licensed. "
            "This project relies on these packages under one of the listed licenses, "
            "as permitted by their terms."
        )
        lines.append("")

        for pkg in sorted(multi_license.keys(), key=str.lower):
            licenses = " **OR** ".join(md_escape(l) for l in multi_license[pkg])
            lines.append(f"- **{md_escape(pkg)}**: {licenses}")
        lines.append("")

    return "\n".join(lines)

def main():
    ap = argparse.ArgumentParser(
        description="Generate a Markdown attribution list from nlf output."
    )
    ap.add_argument(
        "input",
        nargs="?",
        help="Optional path to licenses.txt (if omitted, nlf will be run automatically)",
    )
    ap.add_argument("-o", "--output", help="Output Markdown file (default: stdout)")
    ap.add_argument("--project", help="Project name to include in the title")
    args = ap.parse_args()

    if args.input:
        with open(args.input, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    else:
        text = get_nlf_output()

    single_license, multi_license = parse_licenses_text(text)
    md = generate_markdown(single_license, multi_license, project_name=args.project)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(md.rstrip() + "\n")
    else:
        print(md.rstrip())

if __name__ == "__main__":
    main()

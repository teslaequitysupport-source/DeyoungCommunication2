#!/usr/bin/env python3
"""
Em-dash sweep for user-facing copy.

Replaces the spaced em dash " — " with ", " in .tsx/.ts files under
src/app and src/components (plus src/lib/legal if present), while
SKIPPING comment lines and code-comment blocks, which users never see.
Unspaced em dashes are reported, not touched.
"""

import os
import re

ROOTS = ["src/app", "src/components", "src/lib/legal"]
COMMENT_PREFIXES = ("*", "//", "/*", "{/*", "*/")

changed_files = 0
changed_lines = 0
unspaced = []

for root in ROOTS:
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if not name.endswith((".tsx", ".ts")):
                continue
            path = os.path.join(dirpath, name)
            with open(path, encoding="utf-8") as fh:
                lines = fh.readlines()

            dirty = False
            for i, line in enumerate(lines, 1):
                stripped = line.lstrip()
                if stripped.startswith(COMMENT_PREFIXES):
                    continue
                if " — " in line:
                    new = line.replace(" — ", ", ")
                    if new != line:
                        lines[i - 1] = new
                        dirty = True
                        changed_lines += 1
                for m in re.finditer(r"\S—\S|\S— |—\S", line):
                    if not stripped.startswith(COMMENT_PREFIXES):
                        unspaced.append(f"{path}:{i}:{line.strip()[:80]}")

            if dirty:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.writelines(lines)
                changed_files += 1
                print(f"cleaned {path}")

print(f"\n{changed_files} files, {changed_lines} lines updated")
if unspaced:
    print("\nUNSPACED em dashes (review manually):")
    for u in unspaced[:20]:
        print(" ", u)

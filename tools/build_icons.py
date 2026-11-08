"""Build src/ui/icon-data.json from game-icons.net artwork.

Usage:
  python3 tools/build_icons.py <iconify icons.json> <author tree list>

- <iconify icons.json>: icons.json from the @iconify-json/game-icons npm package.
- <author tree list>: `git ls-tree -r --name-only HEAD` of github.com/game-icons/icons,
  used to look up each icon's author (folder name).
"""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
icons = json.load(open(sys.argv[1], encoding="utf8"))["icons"]
authors = {}
for line in open(sys.argv[2], encoding="utf8"):
    parts = line.strip().split("/")
    if len(parts) >= 2 and parts[-1].endswith(".svg"):
        authors.setdefault(parts[-1][:-4], parts[0])

mapping = json.load(open(root / "tools" / "icon_map.json", encoding="utf8"))
out = {"slots": {}, "icons": {}}
missing = []
for slot, name in mapping.items():
    if slot.startswith("_"):
        continue
    if name not in icons:
        missing.append(f"{slot}: {name}")
        continue
    out["slots"][slot] = name
    if name not in out["icons"]:
        body = icons[name]["body"].replace(' fill="currentColor"', "")
        out["icons"][name] = {"author": authors.get(name, "unknown"), "body": body}

if missing:
    sys.exit("Missing icons:\n" + "\n".join(missing))

dest = root / "src" / "ui" / "icon-data.json"
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
by_author = {}
for name, icon in out["icons"].items():
    by_author.setdefault(icon["author"], []).append(name)
print(f"Wrote {dest.relative_to(root)}: {len(out['icons'])} icons, {dest.stat().st_size // 1024} KB")
for author, names in sorted(by_author.items()):
    print(f"  {author}: {', '.join(sorted(names))}")

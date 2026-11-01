"""Build data/spells/spells.json.

Sources:
  - SRD 5.1 spell data from the 5e-bits/5e-database repository
    (pass the path to 5e-SRD-Spells.json as the first argument).
  - tools/bg3_spells.json: the list of spells available to player classes
    in Baldur's Gate 3, with Korean names and data for spells outside the SRD.

Usage:
  python tools/build_spells.py <path/to/5e-SRD-Spells.json>
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BG3_LIST = ROOT / "tools" / "bg3_spells.json"
OUT = ROOT / "data" / "spells" / "spells.json"


def from_srd(s):
    """Convert one SRD spell record into our format."""
    return {
        "id": s["index"],
        "name": {"ko": None, "en": s["name"]},
        "level": s["level"],
        "school": s["school"]["index"],
        "classes": sorted(c["index"] for c in s.get("classes", [])),
        "ritual": s.get("ritual", False),
        "concentration": s.get("concentration", False),
        "castingTime": s.get("casting_time"),
        "range": s.get("range"),
        "duration": s.get("duration"),
        "components": s.get("components", []),
        "source": "SRD5.1",
        "bg3": False,
        "summary": {"ko": None, "en": None},
        "desc": {"ko": None, "en": "\n\n".join(s.get("desc", []))},
        "higherLevel": {"ko": None, "en": "\n\n".join(s.get("higher_level", [])) or None},
    }


def from_extra(e):
    """Create a record for a spell that is not in the SRD.

    Only mechanical data is stored here; descriptions are written separately.
    """
    name = {"ko": e["ko"], "en": e["en"]}
    if e.get("bg3En"):
        name["bg3En"] = e["bg3En"]
    return {
        "id": e["id"],
        "name": name,
        "level": e["level"],
        "school": e["school"],
        "classes": sorted(e["classes"]),
        "ritual": e.get("ritual", False),
        "concentration": e.get("concentration", False),
        "castingTime": None,
        "range": None,
        "duration": None,
        "components": [],
        "source": e["source"],
        "bg3": True,
        "summary": {"ko": None, "en": None},
        "desc": {"ko": None, "en": None},
        "higherLevel": {"ko": None, "en": None},
    }


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)

    srd = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    bg3 = json.loads(BG3_LIST.read_text(encoding="utf-8"))

    spells = {s["index"]: from_srd(s) for s in srd}
    errors = []

    # Mark SRD spells that appear in BG3 and attach Korean / BG3 names.
    for entry in bg3["srd"]:
        sid = entry["id"]
        if sid not in spells:
            errors.append(f"SRD id not found: {sid}")
            continue
        spell = spells[sid]
        spell["bg3"] = True
        spell["name"]["ko"] = entry["ko"]
        if entry.get("bg3En"):
            spell["name"]["bg3En"] = entry["bg3En"]
        if entry.get("level") is not None and entry["level"] != spell["level"]:
            errors.append(f"Level mismatch for {sid}: list {entry['level']} vs SRD {spell['level']}")

    # Add BG3 spells that are not part of the SRD.
    for entry in bg3["extra"]:
        if entry["id"] in spells:
            errors.append(f"Extra spell already exists in SRD: {entry['id']}")
            continue
        spells[entry["id"]] = from_extra(entry)

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    ordered = sorted(spells.values(), key=lambda s: (s["level"], s["name"]["en"]))
    out = {
        "_meta": {
            "schemaVersion": 1,
            "description": "Spell data. SRD entries keep the SRD 5.1 English text; Korean text and non-SRD descriptions are written separately.",
            "attribution": "Includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed under CC BY 4.0.",
            "koVerified": False,
        },
        "spells": ordered,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    total_bg3 = sum(1 for s in ordered if s["bg3"])
    print(f"Wrote {len(ordered)} spells ({total_bg3} available in BG3) to {OUT}")


if __name__ == "__main__":
    main()

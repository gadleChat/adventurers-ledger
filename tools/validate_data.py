"""Validate cross-references in data/.

Checks that race data only refers to spells, skills, languages, abilities,
and damage types that exist, that every user-facing text has both Korean and
English, and that `replaces` points at real parent traits.

Usage:
  python tools/validate_data.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

ABILITIES = {"str", "dex", "con", "int", "wis", "cha"}
EFFECT_TYPES = {
    "darkvision", "speed", "hpPerLevel", "resistance", "advantage", "reroll",
    "skillProficiency", "skillChoice", "weaponProficiency", "armorProficiency",
    "toolChoice", "cantrip", "cantripChoice", "innateSpell", "featChoice",
    "breathWeapon", "other",
}


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    glossary = load(DATA / "glossary.json")
    spells = {s["id"]: s for s in load(DATA / "spells" / "spells.json")["spells"]}
    skills = set(glossary["skills"])
    languages = set(glossary["languages"])
    damage_types = set(glossary["damageTypes"])
    classes = set(glossary["classes"])
    errors = []

    def check_text(where, value, name):
        if not isinstance(value, dict) or not value.get("ko") or not value.get("en"):
            errors.append(f"{where}: '{name}' needs both ko and en")

    def check_bonus(where, bonus):
        for ability in bonus or {}:
            if ability not in ABILITIES:
                errors.append(f"{where}: unknown ability '{ability}'")

    def check_languages(where, langs):
        for lang in (langs or {}).get("fixed", []):
            if lang not in languages:
                errors.append(f"{where}: unknown language '{lang}'")

    def check_effect(where, effect):
        etype = effect.get("type")
        if etype not in EFFECT_TYPES:
            errors.append(f"{where}: unknown effect type '{etype}'")
            return
        if etype in ("cantrip", "innateSpell"):
            spell = spells.get(effect.get("spell"))
            if spell is None:
                errors.append(f"{where}: unknown spell '{effect.get('spell')}'")
            elif etype == "cantrip" and spell["level"] != 0:
                errors.append(f"{where}: '{spell['id']}' is not a cantrip")
            elif etype == "innateSpell" and effect.get("castLevel", 0) < spell["level"]:
                errors.append(f"{where}: '{spell['id']}' cast below its level")
        if etype in ("cantrip", "cantripChoice", "innateSpell") and effect.get("ability") not in ABILITIES:
            errors.append(f"{where}: bad spellcasting ability")
        if etype == "cantripChoice" and effect.get("list") not in classes:
            errors.append(f"{where}: unknown class list '{effect.get('list')}'")
        if etype == "skillProficiency" and effect.get("skill") not in skills:
            errors.append(f"{where}: unknown skill '{effect.get('skill')}'")
        if etype == "skillChoice":
            for skill in effect.get("from", []):
                if skill not in skills:
                    errors.append(f"{where}: unknown skill '{skill}'")
        if etype in ("resistance", "breathWeapon") and effect.get("damage") not in damage_types:
            errors.append(f"{where}: unknown damage type '{effect.get('damage')}'")
        if etype == "advantage" and effect.get("skill") and effect["skill"] not in skills:
            errors.append(f"{where}: unknown skill '{effect['skill']}'")

    def check_traits(where, traits):
        seen = set()
        for trait in traits:
            tid = trait.get("id")
            tw = f"{where}/{tid}"
            if tid in seen:
                errors.append(f"{tw}: duplicate trait id")
            seen.add(tid)
            check_text(tw, trait.get("name"), "name")
            check_text(tw, trait.get("desc"), "desc")
            for effect in trait.get("effects", []):
                check_effect(tw, effect)
        return seen

    index = load(DATA / "races" / "_index.json")["order"]
    files = {p.stem for p in (DATA / "races").glob("*.json") if not p.stem.startswith("_")}
    if set(index) != files:
        errors.append(f"races/_index.json does not match files: {sorted(set(index) ^ files)}")

    for race_id in index:
        path = DATA / "races" / f"{race_id}.json"
        if not path.exists():
            continue
        race = load(path)
        where = f"races/{race_id}"
        if race.get("id") != race_id:
            errors.append(f"{where}: id does not match file name")
        for field in ("name", "summary", "desc"):
            check_text(where, race.get(field), field)
        check_bonus(where, race.get("defaultBonus"))
        check_languages(where, race.get("languages"))
        parent_traits = check_traits(where, race.get("traits", []))
        for key in ("height", "lifespan"):
            check_text(where, race.get("appearanceHints", {}).get(key), key)

        sub_ids = set()
        for sub in race.get("subraces", []):
            sw = f"{where}/{sub.get('id')}"
            if sub.get("id") in sub_ids:
                errors.append(f"{sw}: duplicate subrace id")
            sub_ids.add(sub.get("id"))
            check_text(sw, sub.get("name"), "name")
            check_text(sw, sub.get("summary"), "summary")
            if "desc" in sub:
                check_text(sw, sub["desc"], "desc")
            check_bonus(sw, sub.get("defaultBonus"))
            check_languages(sw, sub.get("languages"))
            check_traits(sw, sub.get("traits", []))
            for replaced in sub.get("replaces", []):
                if replaced not in parent_traits:
                    errors.append(f"{sw}: replaces unknown parent trait '{replaced}'")

    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"OK: {len(index)} races checked")


if __name__ == "__main__":
    main()

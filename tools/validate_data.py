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

    class_count = check_classes(glossary, spells, errors, check_text)
    done, total = check_subclasses(spells, errors, check_text, check_effect)
    check_lists(errors, check_text)
    for path in sorted((DATA / "classes").glob("[!_]*.json")):
        for fid, feature in load(path).get("features", {}).items():
            check_choice(f"classes/{path.stem}/{fid}", feature.get("choice"), errors)
    for fid, feature in load(DATA / "lists" / "common_features.json")["features"].items():
        check_choice(f"lists/common_features/{fid}", feature.get("choice"), errors)

    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"OK: {len(index)} races and {class_count} classes checked; subclass details {done}/{total}")


CLASS_LISTS = {"barbarian", "bard", "cleric", "druid", "fighter", "monk",
               "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"}


def check_choice(where, choice, errors):
    """A choice's `list` must be a class spell list or a file in data/lists/."""
    if not choice or "list" not in choice:
        return
    name = choice["list"]
    if name in CLASS_LISTS:
        return
    path = DATA / "lists" / f"{name}.json"
    if not path.exists():
        errors.append(f"{where}: choice list '{name}' has no file in data/lists/")
        return
    items = {item["id"] for item in load(path).get("items", [])}
    for option in choice.get("only", []):
        if option not in items:
            errors.append(f"{where}: '{option}' is not in list '{name}'")


def check_lists(errors, check_text):
    """Every item in data/lists/*.json with an `items` array needs ko/en text."""
    for path in sorted((DATA / "lists").glob("*.json")):
        data = load(path)
        seen = set()
        for item in data.get("items", []):
            where = f"lists/{path.stem}/{item.get('id')}"
            if item.get("id") in seen:
                errors.append(f"{where}: duplicate id")
            seen.add(item.get("id"))
            check_text(where, item.get("name"), "name")
            check_text(where, item.get("desc"), "desc")


def check_subclasses(spells, errors, check_text, check_effect):
    """Check data/subclasses/<class>.json against the class files."""
    common = load(DATA / "lists" / "common_features.json")["features"]
    done = total = 0
    for path in sorted((DATA / "classes").glob("*.json")):
        if path.stem.startswith("_"):
            continue
        cls = load(path)
        class_id = cls["id"]
        listed = {s["id"] for s in cls.get("subclasses", [])}
        total += len(listed)
        detail_path = DATA / "subclasses" / f"{class_id}.json"
        if not detail_path.exists():
            continue
        detail = load(detail_path)
        where = f"subclasses/{class_id}"
        if detail.get("classId") != class_id:
            errors.append(f"{where}: classId does not match file name")
        allowed_levels = {lv for lv, entry in cls["levels"].items() if entry.get("subclassFeature")}

        for sub_id, sub in detail.get("subclasses", {}).items():
            sw = f"{where}/{sub_id}"
            if sub_id not in listed:
                errors.append(f"{sw}: not listed in classes/{class_id}.json")
                continue
            done += 1
            features = sub.get("features", {})
            used = set()
            for level, fids in sub.get("levels", {}).items():
                if level not in allowed_levels:
                    errors.append(f"{sw}: level {level} is not a subclass feature level")
                for fid in fids:
                    used.add(fid)
                    if fid not in features and fid not in common and fid not in cls.get("features", {}):
                        errors.append(f"{sw}: unknown feature '{fid}'")
            missing_levels = allowed_levels - set(sub.get("levels", {}))
            if missing_levels:
                errors.append(f"{sw}: no features at subclass levels {sorted(missing_levels, key=int)}")
            for fid, feature in features.items():
                if fid not in used:
                    errors.append(f"{sw}: feature '{fid}' is never granted")
                check_text(f"{sw}/{fid}", feature.get("name"), "name")
                check_text(f"{sw}/{fid}", feature.get("desc"), "desc")
                for effect in feature.get("effects", []):
                    check_effect(f"{sw}/{fid}", effect)

            for fid, feature in features.items():
                check_choice(f"{sw}/{fid}", feature.get("choice"), errors)

            spellcasting = sub.get("spellcasting")
            if spellcasting:
                for key in ("cantripsKnown", "spellsKnown"):
                    if len(spellcasting.get(key, [])) != 20:
                        errors.append(f"{sw}: spellcasting '{key}' needs 20 values")
                if spellcasting.get("progression") != "third":
                    errors.append(f"{sw}: subclass casters should use 'third' progression")
                for sid in spellcasting.get("fixedCantrips", []):
                    if sid not in spells:
                        errors.append(f"{sw}: unknown spell '{sid}'")

            for key, table in sub.get("scaling", {}).items():
                if len(table.get("values", [])) != 20:
                    errors.append(f"{sw}: scaling '{key}' needs 20 values")

            spell_tables = [sub.get("bonusSpells", {}), sub.get("expandedSpells", {})]
            spell_tables += list(sub.get("terrainSpells", {}).values())
            for table in spell_tables:
                for level, ids in table.items():
                    for sid in ids:
                        if sid not in spells:
                            errors.append(f"{sw}: unknown spell '{sid}' at level {level}")
    return done, total


def check_classes(glossary, spells, errors, check_text):
    skills = set(glossary["skills"])
    common = load(DATA / "lists" / "common_features.json")["features"]
    for fid, feature in common.items():
        check_text(f"lists/common_features/{fid}", feature.get("name"), "name")
        check_text(f"lists/common_features/{fid}", feature.get("desc"), "desc")

    index = load(DATA / "classes" / "_index.json")["order"]
    files = {p.stem for p in (DATA / "classes").glob("*.json") if not p.stem.startswith("_")}
    if set(index) != files:
        errors.append(f"classes/_index.json does not match files: {sorted(set(index) ^ files)}")

    for class_id in index:
        path = DATA / "classes" / f"{class_id}.json"
        if not path.exists():
            continue
        cls = load(path)
        where = f"classes/{class_id}"
        if cls.get("id") != class_id:
            errors.append(f"{where}: id does not match file name")
        for field in ("name", "summary", "desc", "subclassTitle"):
            check_text(where, cls.get(field), field)
        for ability in cls.get("saves", []) + cls.get("primary", []):
            if ability not in ABILITIES:
                errors.append(f"{where}: unknown ability '{ability}'")
        choice = cls.get("skillChoice", {})
        for skill in choice.get("from") or []:
            if skill not in skills:
                errors.append(f"{where}: unknown skill '{skill}'")

        features = cls.get("features", {})
        for fid, feature in features.items():
            check_text(f"{where}/{fid}", feature.get("name"), "name")
            check_text(f"{where}/{fid}", feature.get("desc"), "desc")

        levels = cls.get("levels", {})
        if sorted(levels, key=int) != [str(n) for n in range(1, 21)]:
            errors.append(f"{where}: levels must cover 1-20")
        used = set()
        for level, entry in levels.items():
            for fid in entry.get("features", []):
                used.add(fid)
                if fid not in features and fid not in common:
                    errors.append(f"{where}: level {level} refers to unknown feature '{fid}'")
        for fid in features:
            if fid not in used:
                errors.append(f"{where}: feature '{fid}' is never granted")
        if not levels.get(str(cls.get("subclassLevel")), {}).get("subclassFeature"):
            errors.append(f"{where}: subclassLevel is not marked as a subclass feature level")

        for key, table in cls.get("scaling", {}).items():
            check_text(f"{where}/scaling/{key}", table.get("name"), "name")
            if len(table.get("values", [])) != 20:
                errors.append(f"{where}: scaling '{key}' needs 20 values")

        spellcasting = cls.get("spellcasting")
        if spellcasting:
            if spellcasting.get("ability") not in ABILITIES:
                errors.append(f"{where}: bad spellcasting ability")
            if spellcasting.get("progression") not in ("full", "half", "third", "pact"):
                errors.append(f"{where}: bad spellcasting progression")
            for key in ("cantripsKnown", "spellsKnown"):
                values = spellcasting.get(key)
                if values is not None and len(values) != 20:
                    errors.append(f"{where}: spellcasting '{key}' needs 20 values")
            if not any(class_id in s["classes"] for s in spells.values()):
                errors.append(f"{where}: no spells list this class")

        sub_ids = set()
        for sub in cls.get("subclasses", []):
            sw = f"{where}/{sub.get('id')}"
            if sub.get("id") in sub_ids:
                errors.append(f"{sw}: duplicate subclass id")
            sub_ids.add(sub.get("id"))
            check_text(sw, sub.get("name"), "name")
            check_text(sw, sub.get("summary"), "summary")
    return len(index)


if __name__ == "__main__":
    main()

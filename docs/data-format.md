# Data Format

All game data lives in `data/`. Every user-facing string is stored as `{ "ko": "...", "en": "..." }`.
Korean is shown in the plugin UI; English is what gets sent to the LLM and shown as the small original name in tooltips.

## Races (`data/races/<id>.json`)

| Field | Meaning |
|---|---|
| `id` | Stable identifier. Never rename after release. |
| `name` | Display name. `bg3En` is added when Baldur's Gate 3 uses a different English name. |
| `source` | `SRD5.1`, `PHB`, `SCAG`, `MToF`, `EE`, etc. Non-SRD entries must have text written from scratch. |
| `summary` | One line for cards and compact LLM context. |
| `desc` | A few sentences for the detail panel. |
| `size` | `small`, `medium`, ... |
| `speed` | Walking speed in feet. |
| `defaultBonus` | The race's original ability score increases. The UI pre-fills these; players may move each bonus to any ability (BG3 style). |
| `languages` | `{ "fixed": [...], "choose": n }`. Ids match `glossary.json` → `languages`. |
| `traits` | List of traits (see below). |
| `subraces` | Same shape as a race, minus `size`/`speed`/`languages` unless they change. A subrace adds to the parent; `replaces` lists parent trait ids it removes. |
| `appearanceHints` | `height`, `lifespan` (both `{ko, en}`), and `examples` (Korean suggestion chips). |
| `bonusChoice` | Optional. Extra increases the player picks, e.g. half-elf `{ "choose": 2, "amount": 1, "exclude": ["cha"] }`. |
| `bonusOverride` | Optional, on a subrace. Replaces the parent's `defaultBonus` entirely with a choice (variant human). |
| `rulesNote` | Optional. Explains where this data departs from how the rules books organize it. |
| `aliasEn` | Optional. Another common English name (e.g. `Hill Dwarf` for `Gold Dwarf`). |
| `ancestry` | Dragonborn only: `damage`, `shape`, `save` of the breath weapon. |

Race files are listed in display order in `data/races/_index.json`.

### Traits

```json
{
  "id": "lucky",
  "name": { "ko": "행운", "en": "Lucky" },
  "desc": { "ko": "...", "en": "..." },
  "effects": [ { "type": "...", ... } ]
}
```

`desc` is shown in the detail panel and also used as the trait text sent to the LLM.
A trait with no mechanical effect has `"effects": []`.

### Effect types

Effects are read by the calculator. Anything that only matters in play (rerolls, advantage) is stored for judgement mode and ignored otherwise.

| Type | Fields | Meaning |
|---|---|---|
| `darkvision` | `range` | Darkvision range in feet. Highest value wins. |
| `speed` | `value` | Sets walking speed. |
| `hpPerLevel` | `value` | Extra max HP per character level. |
| `resistance` | `damage` | Resistance to a damage type. |
| `advantage` | `on` (`save`, `check`), `vs` or `ability` or `skill`, optional `note` | Advantage on certain rolls. |
| `reroll` | `on`, `rolls` | Reroll certain dice results. |
| `skillProficiency` | `skill` | Fixed skill proficiency. |
| `skillChoice` | `count`, optional `from`, optional `orTool` | Choose skill proficiencies. Omitted `from` means any skill. `orTool: true` lets the player pick a tool instead. |
| `weaponProficiency` | `weapons` | Weapon ids or categories (`simple`, `martial`). |
| `armorProficiency` | `armor` | `light`, `medium`, `heavy`, `shield`. |
| `toolChoice` | `count`, `from` | Choose tool proficiencies. |
| `cantrip` | `spell`, `ability` | A fixed cantrip. |
| `cantripChoice` | `count`, `list`, `ability` | Choose a cantrip from a class list (e.g. `wizard`). |
| `innateSpell` | `spell`, `minLevel`, `castLevel`, `uses`, `recharge`, `ability` | A spell gained at a character level and cast without a slot. |
| `featChoice` | `count` | Choose a feat. |
| `breathWeapon` | `damage`, `shape`, `save` | Dragonborn breath weapon. |
| `other` | `key` | A rule the calculator does not model; the text in `desc` is enough. |

## Classes (`data/classes/<id>.json`)

| Field | Meaning |
|---|---|
| `hitDie`, `primary`, `saves` | Hit die size, main abilities, saving throw proficiencies. |
| `proficiencies` | `armor`, `weapons`, `tools`, optional `toolChoice`. |
| `skillChoice` | `{ "count": n, "from": [...] }`. `from: null` means any skill. |
| `spellcasting` | `null` for non-casters. Otherwise `ability`, `type` (`known`/`prepared`), `progression` (`full`/`half`/`third`/`pact`, see `data/lists/spell_slots.json`), `list`, `ritual`, `cantripsKnown` and `spellsKnown` (20 values each, or `null`), optional `startLevel`, `preparedFormula`. |
| `subclassLevel`, `subclassTitle` | When the subclass is chosen and what it is called. |
| `levels` | Keys `"1"`–`"20"`. `features` lists feature ids gained at that level (from this file's `features` or `data/lists/common_features.json`). A repeated id means the feature grants another pick. `subclassFeature: true` marks levels where the subclass grants something. |
| `scaling` | Tables of 20 values for things that grow with level (rage uses, sneak attack dice, ...). |
| `features` | Feature definitions. `choice` describes a pick the player makes (`list` refers to a file in `data/lists/`). |
| `subclasses` | `id`, `name`, `source`, `summary`. Subclass features are added in a later pass. |

Class files are listed in display order in `data/classes/_index.json`.

## Subclass details (`data/subclasses/<class>.json`)

```json
{
  "classId": "cleric",
  "subclasses": {
    "life": {
      "bonusSpells": { "1": ["bless", "cure-wounds"] },
      "levels": { "1": ["disciple_of_life"], "2": ["preserve_life"] },
      "features": { "disciple_of_life": { "name": {...}, "desc": {...}, "effects": [...] } }
    }
  }
}
```

| Field | Meaning |
|---|---|
| `levels` | Feature ids gained at each of the class's subclass feature levels. May refer to `common_features.json` (e.g. `extra_attack`). |
| `features` | Same shape as class features, with optional `effects` and `choice`. |
| `bonusSpells` | Spells always prepared / always known, keyed by class level (domain, circle, oath, and patron spells). |
| `terrainSpells` | Circle of the Land only: `bonusSpells` tables per chosen terrain. |

## Spells (`data/spells/spells.json`)

Generated by `tools/build_spells.py`. Do not edit by hand — edit the files in `tools/` and rebuild.

// Display names for choice options that are plain ids rather than list items.
import { glossary, spellById } from "./data.js";

export const named = (ko, en) => ({ ko, en });

/** Display names for options that are plain ids rather than list items. */
export const OPTION_NAMES = {
  bear: named("곰", "Bear"), eagle: named("독수리", "Eagle"), elk: named("엘크", "Elk"),
  tiger: named("호랑이", "Tiger"), wolf: named("늑대", "Wolf"),
  chain: named("사슬의 계약", "Pact of the Chain"), blade: named("칼날의 계약", "Pact of the Blade"),
  tome: named("책의 계약", "Pact of the Tome"),
  arctic: named("북극", "Arctic"), coast: named("해안", "Coast"), desert: named("사막", "Desert"),
  forest: named("숲", "Forest"), grassland: named("초원", "Grassland"), mountain: named("산", "Mountain"),
  swamp: named("늪", "Swamp"), underdark: named("언더다크", "Underdark"),
  black: named("검은 용 (산성)", "Black (acid)"), blue: named("푸른 용 (번개)", "Blue (lightning)"),
  brass: named("황동 용 (화염)", "Brass (fire)"), bronze: named("청동 용 (번개)", "Bronze (lightning)"),
  copper: named("구리 용 (산성)", "Copper (acid)"), gold: named("금 용 (화염)", "Gold (fire)"),
  green: named("초록 용 (독)", "Green (poison)"), red: named("붉은 용 (화염)", "Red (fire)"),
  silver: named("은 용 (냉기)", "Silver (cold)"), white: named("하얀 용 (냉기)", "White (cold)"),
  colossus_slayer: named("거인 처단자", "Colossus Slayer"), giant_killer: named("대형 사냥꾼", "Giant Killer"),
  horde_breaker: named("무리 파괴자", "Horde Breaker"), escape_the_horde: named("포위 탈출", "Escape the Horde"),
  multiattack_defense: named("다중 공격 방어", "Multiattack Defense"), steel_will: named("강철 의지", "Steel Will"),
  volley: named("일제 사격", "Volley"), whirlwind_attack: named("회오리 공격", "Whirlwind Attack"),
  evasion: named("회피", "Evasion"), stand_against_the_tide: named("물결 막기", "Stand Against the Tide"),
  uncanny_dodge: named("기막힌 회피", "Uncanny Dodge"),
  smiths_tools: named("대장장이 도구", "Smith's Tools"), brewers_supplies: named("양조사 도구", "Brewer's Supplies"),
  masons_tools: named("석공 도구", "Mason's Tools"), artisans_tools: named("장인 도구", "Artisan's Tools"),
  thieves_tools: named("도둑 도구", "Thieves' Tools"),
};

export function optionName(id) {
  return OPTION_NAMES[id]
    ?? spellById[id]?.name
    ?? glossary.classes[id]
    ?? glossary.damageTypes[id]
    ?? glossary.skills[id]
    ?? glossary.languages[id]
    ?? named(id, id);
}


// Icons from game-icons.net (CC BY 3.0). See tools/icon_map.json and CREDITS.md.
import data from "./icon-data.json";

/** Returns the icon name for a slot such as "class:wizard", or null. */
export function iconFor(slot) {
  return data.slots[slot] ?? null;
}

/** Renders a game-icons.net icon by slot ("race:elf") or icon name. Decorative only. */
export function Icon({ slot, name, class: extra }) {
  const id = name ?? data.slots[slot];
  const icon = id ? data.icons[id] : null;
  if (!icon) return null;
  return (
    <svg
      class={`gi${extra ? ` ${extra}` : ""}`}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

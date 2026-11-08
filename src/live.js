// Small shared store for state that lives outside the UI: the saved sheets and
// settings used by chat link mode, rolls waiting for the next message, and
// which panel to show when the plugin window is opened from the chat.

let state = { sheets: [], settings: {}, pendingRolls: [], view: null };
const listeners = new Set();

export const live = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

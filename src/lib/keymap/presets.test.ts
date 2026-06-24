import { DEFAULT_KEYMAP, VIM_KEYMAP } from "@/lib/keymap/presets";

it("default keymap binds conceded and extended", () => {
  expect(DEFAULT_KEYMAP.bindings.normal["Ctrl+Shift+x"]).toBe("status.toggleConceded");
  expect(DEFAULT_KEYMAP.bindings.normal["Ctrl+e"]).toBe("status.toggleExtended");
});

it("binds grab-to-move in both keymaps without colliding", () => {
  // default cells are always editable, so grab must be a chord; vim uses bare 'm'.
  expect(DEFAULT_KEYMAP.bindings.normal["Ctrl+m"]).toBe("move.grab");
  expect(VIM_KEYMAP.bindings.normal["m"]).toBe("move.grab");
});

it("move mode binds commit/cancel and spatial navigation", () => {
  for (const km of [DEFAULT_KEYMAP, VIM_KEYMAP]) {
    expect(km.bindings.move["Enter"]).toBe("move.commit");
    expect(km.bindings.move["Escape"]).toBe("move.cancel");
    expect(km.bindings.move["ArrowRight"]).toBe("move.right");
  }
  // vim move mode also accepts hjkl.
  expect(VIM_KEYMAP.bindings.move["l"]).toBe("move.right");
  expect(VIM_KEYMAP.bindings.move["h"]).toBe("move.left");
});

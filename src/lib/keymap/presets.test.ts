import { DEFAULT_KEYMAP } from "@/lib/keymap/presets";

it("default keymap binds conceded and extended", () => {
  expect(DEFAULT_KEYMAP.bindings.normal["Ctrl+Shift+x"]).toBe("status.toggleConceded");
  expect(DEFAULT_KEYMAP.bindings.normal["Ctrl+e"]).toBe("status.toggleExtended");
});

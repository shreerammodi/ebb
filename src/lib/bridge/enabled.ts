/**
 * The one gate every CardMirror feature passes through.
 *
 * The bridge only exists inside the desktop shell, and the user can switch the
 * integration off in Settings then Editor. What the switch gates is the
 * renderer's half: the loopback socket is bound for the whole launch and
 * `ebb.session.json` carries this run's token either way, so a same-user
 * process holding that token still reaches `/ping`, which Rust answers alone.
 * Both halves of the bridge ask here rather than testing the two conditions
 * apart; the settings and cheatsheet UI mirror it with a subscription so they
 * re-render on the toggle.
 */

import { useFlowStore } from "@/lib/store/useFlowStore";
import { isDesktop } from "@/lib/update/adapter";

export function cardmirrorLive(): boolean {
    return isDesktop() && useFlowStore.getState().cardmirrorEnabled;
}

/**
 * The push gate: the same conditions plus its own switch.
 *
 * The integration switch is about ebb receiving text and about reaching the
 * document when the debater asks for it, both of which start with a keystroke
 * aimed at CardMirror. This one lets ebb rewrite a document nobody is looking
 * at, on every cell edit that carries a token, so it is a second decision and
 * defaults off rather than riding the first.
 */
export function cardmirrorPushLive(): boolean {
    return cardmirrorLive() && useFlowStore.getState().cardmirrorPushEdits;
}

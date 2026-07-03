import { uid } from "@/lib/model/ids";
import type { ArgGroup } from "@/lib/model/types";

/** Creates a new group from the given members and options. */
export function createGroup(
    groups: ArgGroup[],
    input: { sheetId: string; memberIds: string[]; label?: string },
): ArgGroup[] {
    const group: ArgGroup = {
        id: uid("group"),
        sheetId: input.sheetId,
        label: input.label ?? "",
        memberIds: [...input.memberIds],
    };
    return [...groups, group];
}

/** Removes a node from whatever group holds it; dissolves the group if <2 remain. */
export function removeMemberOrDelete(groups: ArgGroup[], nodeId: string): ArgGroup[] {
    return (
        groups
            .map((g) =>
                g.memberIds.includes(nodeId)
                    ? {
                          ...g,
                          memberIds: g.memberIds.filter((id) => id !== nodeId),
                      }
                    : g,
            )
            // Groups must have at least two members to exist in the main array.
            .filter((g) => g.memberIds.length >= 2)
    );
}

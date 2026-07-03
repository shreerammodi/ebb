import { uid } from "@/lib/model/ids";
import type { ArgGroup } from "@/lib/model/types";

/** Finds the group containing a specific node ID within a list of groups. */
export function groupForNode(groups: ArgGroup[], nodeId: string): ArgGroup | null {
    return groups.find((g) => g.memberIds.includes(nodeId)) ?? null;
}

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

/** Adds a node to an existing group identified by groupId. Returns the new array of groups. */
export function addMember(groups: ArgGroup[], groupId: string, nodeId: string): ArgGroup[] {
    return groups.map((g) =>
        g.id === groupId && !g.memberIds.includes(nodeId)
            ? { ...g, memberIds: [...g.memberIds, nodeId] }
            : g,
    );
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

/** Updates the label of a specific group ID and returns the new array of groups. */
export function setLabel(groups: ArgGroup[], groupId: string, label: string): ArgGroup[] {
    return groups.map((g) => (g.id === groupId ? { ...g, label } : g));
}

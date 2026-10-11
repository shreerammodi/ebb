/** One tab of a bordered segmented switch (Edit / Preview, Flow / Decision). */
export function segmentedTabClass(selected: boolean): string {
    return selected
        ? "bg-accent text-accent-foreground px-2 py-0.5"
        : "text-muted-foreground hover:bg-accent/50 px-2 py-0.5";
}

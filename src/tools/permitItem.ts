export type PileSize = "small" | "large" | "multiple";

export interface SelectOption {
    value: string;
    text: string;
}

// Matched against option labels, not values: the state site renumbers values without notice.
const PILE_SIZE_PATTERNS: Record<PileSize, RegExp> = {
    small: /less than 10'?\s*x\s*10/i,
    large: /^(?!.*multiple).*less than 20'?\s*x\s*20/i,
    multiple: /multiple piles/i,
};

/** Picks the value of the "Type of Item to Burn" option that matches the requested pile size. */
export function chooseBurnItem(options: SelectOption[], pileSize: PileSize = "small"): string {
    const real = options.filter((o) => o.value.trim() !== "");
    if (real.length === 0) {
        throw new Error("No burn item options were offered by the permit form.");
    }
    const match = real.find((o) => PILE_SIZE_PATTERNS[pileSize].test(o.text));
    return (match ?? real[0]).value;
}

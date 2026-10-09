export const BOARD_KINDS = ['search', 'offer', 'gift', 'meet'] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

// Wer einen Aushang sieht: Umkreis um den Ort des Autors, oder alle (auch
// ohne Login). "street" ist kein echter Strassenabgleich (Profile kennen nur
// die Stadt), sondern der kleinste Umkreis.
export const BOARD_VISIBILITIES = ['street', 'r500', 'r1000', 'kiez', 'public'] as const;
export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number];

export const VISIBILITY_METERS: Record<Exclude<BoardVisibility, 'public'>, number> = {
    street: 150,
    r500: 500,
    r1000: 1000,
    kiez: 3000,
};

// Filter der Ansicht: wie weit schaue ich, "all" = alles, was ich sehen darf
export const BOARD_RANGES = ['street', 'r500', 'r1000', 'kiez', 'all'] as const;
export type BoardRange = (typeof BOARD_RANGES)[number];

export const BOARD_POST_DAYS = 14;

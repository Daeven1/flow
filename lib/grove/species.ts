/** IDs are stored verbatim in FocusSession and GrovePlant, including the original four. */
export const LEGACY_SPECIES = ["WILDFLOWERS", "FERN", "BERRY_BUSH", "TREE"] as const;
export const SPECIES = [
  "CHICORY", "FIREWEED", "CANADA_COLUMBINE", "BLUE_FLAG_IRIS", "OSTRICH_FERN", "MAIDENHAIR_FERN",
  "PAPER_BIRCH", "WHITE_SPRUCE", ...LEGACY_SPECIES,
] as const;
export type Species = (typeof SPECIES)[number];
export function isLegacySpecies(species: Species): boolean {
  return LEGACY_SPECIES.some((id) => id === species);
}

export const PLANT_FORMS = ["Wildflowers", "Ferns", "Shrubs", "Trees"] as const;
type PlantForm = (typeof PLANT_FORMS)[number];

type SpeciesInfo = {
  name: string;
  form: PlantForm;
  botany?: { scientificName: string; canadianRange: string; vascanId: number };
};

export const SPECIES_INFO: Record<Species, SpeciesInfo> = {
  CHICORY: {
    name: "Common chicory", form: "Wildflowers",
    botany: { scientificName: "Cichorium intybus", canadianRange: "Introduced in Canada, including British Columbia and Ontario.", vascanId: 2987 },
  },
  FIREWEED: {
    name: "Fireweed", form: "Wildflowers",
    botany: { scientificName: "Chamaenerion angustifolium", canadianRange: "Native range includes Yukon and British Columbia.", vascanId: 17491 },
  },
  CANADA_COLUMBINE: {
    name: "Canada columbine", form: "Wildflowers",
    botany: { scientificName: "Aquilegia canadensis", canadianRange: "Native range includes Manitoba, Ontario and Quebec.", vascanId: 8444 },
  },
  BLUE_FLAG_IRIS: {
    name: "Northern blue flag", form: "Wildflowers",
    botany: { scientificName: "Iris versicolor", canadianRange: "Native range includes Ontario and Quebec.", vascanId: 6188 },
  },
  OSTRICH_FERN: {
    name: "Ostrich fern", form: "Ferns",
    botany: { scientificName: "Matteuccia pensylvanica", canadianRange: "Native range includes New Brunswick and Ontario.", vascanId: 21998 },
  },
  MAIDENHAIR_FERN: {
    name: "Northern maidenhair fern", form: "Ferns",
    botany: { scientificName: "Adiantum pedatum", canadianRange: "Native range includes Ontario and Quebec.", vascanId: 8382 },
  },
  PAPER_BIRCH: {
    name: "Paper birch", form: "Trees",
    botany: { scientificName: "Betula papyrifera", canadianRange: "Native range includes British Columbia and Ontario.", vascanId: 3697 },
  },
  WHITE_SPRUCE: {
    name: "White spruce", form: "Trees",
    botany: { scientificName: "Picea glauca", canadianRange: "Native range includes British Columbia, Ontario and Quebec.", vascanId: 7173 },
  },
  WILDFLOWERS: { name: "Wildflowers", form: "Wildflowers" },
  FERN: { name: "Fern", form: "Ferns" },
  BERRY_BUSH: { name: "Berry bush", form: "Shrubs" },
  TREE: { name: "Tree", form: "Trees" },
};

const FORM_COST: Record<PlantForm, number> = { Wildflowers: 0, Ferns: 0, Shrubs: 2, Trees: 3 };
export const COST = Object.fromEntries(SPECIES.map((id) => [id, FORM_COST[SPECIES_INFO[id].form]])) as Record<Species, number>;

export function isTree(species: Species): boolean {
  return SPECIES_INFO[species].form === "Trees";
}

/** Enable new named plants only after every serving instance can read their stored IDs. */
export function namedPlantStartsEnabled(): boolean {
  return process.env.GROVE_NAMED_PLANT_STARTS === "1";
}

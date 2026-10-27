import { BLUEPRINT_SOURCES } from "./blueprints";
import { parseBlueprint } from "./schema";
import { SECTORS, type Blueprint, type Sector } from "./types";

/**
 * Every starter blueprint, parsed and cross-checked once when the module
 * loads. A malformed manifest throws here, so it fails the build and the
 * unit tests rather than a customer's new site.
 */
export const BLUEPRINTS: readonly Blueprint[] = BLUEPRINT_SOURCES.map(([file, raw]) => parseBlueprint(raw, `blueprints/${file}.json`));

const byKey = new Map(BLUEPRINTS.map((b) => [b.key, b]));
if (byKey.size !== BLUEPRINTS.length) throw new Error("Two blueprints share a key");
for (const [file] of BLUEPRINT_SOURCES) if (!byKey.has(file)) throw new Error(`blueprints/${file}.json: the key must match the file name`);

export const getBlueprint = (key: string) => byKey.get(key) ?? null;

export const SECTOR_KEYS = Object.keys(SECTORS) as Sector[];

// The starter catalog, in gallery order: one template per sector. Each manifest's "key" must match its file name.
import devtoolsApi from "./devtools-api.json";
import fashionStore from "./fashion-store.json";
import motionStudio from "./motion-studio.json";
import executiveBrand from "./executive-brand.json";
import onlineAcademy from "./online-academy.json";
import boutiqueHotel from "./boutique-hotel.json";

export const BLUEPRINT_SOURCES: [string, unknown][] = [
  ["devtools-api", devtoolsApi],
  ["fashion-store", fashionStore],
  ["motion-studio", motionStudio],
  ["executive-brand", executiveBrand],
  ["online-academy", onlineAcademy],
  ["boutique-hotel", boutiqueHotel],
];

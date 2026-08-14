import businessAdministration from "./business-administration.json";
import computerScience from "./computer-science.json";
import economics from "./economics.json";
import mechanicalEngineering from "./mechanical-engineering.json";

/**
 * Every major file, registered explicitly.
 *
 * The bundler cannot glob JSON at build time, so new majors are added here by
 * hand. `validate:data` fails if a file in this directory is missing from the
 * list, so a major cannot be added to the repo and silently not ship.
 */
export const majorFiles: unknown[] = [
  businessAdministration,
  computerScience,
  economics,
  mechanicalEngineering,
];

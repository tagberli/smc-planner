import catalogData from "@/data/catalog.json";
import geData from "@/data/cal-getc.json";
import { majorFiles } from "@/data/majors";
import type {
  Catalog,
  Course,
  CourseCode,
  GePattern,
  Major,
  MajorTarget,
  Requirement,
  RequirementGroup,
} from "@/lib/types";

/**
 * Loads and resolves the requirement data.
 *
 * The casts are safe because `npm run validate:data` parses every file against
 * the zod schemas in `prebuild` and in CI, so invalid data cannot reach a
 * build. Keeping the parse out of here keeps zod off the client bundle.
 */

export const catalog = catalogData as Catalog;
export const gePattern = geData as GePattern;
export const majors = (majorFiles as Major[]).slice().sort((a, b) => a.name.localeCompare(b.name));

/** Resolve a code against the catalog. Throws rather than rendering a blank course. */
export function getCourse(code: CourseCode): Course {
  const entry = catalog.courses[code];

  if (!entry) {
    throw new Error(`Missing catalog entry for ${code}`);
  }

  return { code, ...entry };
}

export function tryGetCourse(code: CourseCode): Course | undefined {
  const entry = catalog.courses[code];
  return entry ? { code, ...entry } : undefined;
}

export function findMajor(slugOrName: string | null): Major | undefined {
  if (!slugOrName) {
    return undefined;
  }

  return majors.find((major) => major.slug === slugOrName || major.name === slugOrName);
}

export function findTarget(
  major: Major | undefined,
  schoolName: string | null,
): MajorTarget | undefined {
  if (!major || !schoolName) {
    return undefined;
  }

  // Accept "UCLA" or "UCLA, B.S." so older links keep resolving.
  return major.targets.find(
    (target) =>
      target.school === schoolName || `${target.school}, ${target.degree}` === schoolName,
  );
}

export function targetLabel(target: MajorTarget): string {
  return `${target.school}, ${target.degree}`;
}

/**
 * Every course code reachable in a requirement tree, including inside choices.
 * Used for validation and for resolving what a requirement could involve — not
 * for "what must the student take", which depends on the choices they make.
 */
export function collectCourseCodes(requirement: Requirement): CourseCode[] {
  switch (requirement.kind) {
    case "course":
      return [requirement.code];
    case "all":
      return requirement.of.flatMap(collectCourseCodes);
    case "chooseN":
      return requirement.from.flatMap(collectCourseCodes);
    case "chooseAcrossGroups":
      return requirement.groups.flatMap((group: RequirementGroup) =>
        group.from.flatMap(collectCourseCodes),
      );
  }
}

/**
 * The courses a student must take no matter what they choose — i.e. `course`
 * nodes reachable only through `all` nodes. Choice nodes are excluded, since
 * which of their options applies is not known until the student picks.
 */
export function collectRequiredCourseCodes(requirement: Requirement): CourseCode[] {
  switch (requirement.kind) {
    case "course":
      return [requirement.code];
    case "all":
      return requirement.of.flatMap(collectRequiredCourseCodes);
    case "chooseN":
    case "chooseAcrossGroups":
      return [];
  }
}

/** The unresolved choices in a tree, flattened for display. */
export function collectChoices(requirement: Requirement): Requirement[] {
  switch (requirement.kind) {
    case "course":
      return [];
    case "all":
      return requirement.of.flatMap(collectChoices);
    case "chooseN":
    case "chooseAcrossGroups":
      return [requirement];
  }
}

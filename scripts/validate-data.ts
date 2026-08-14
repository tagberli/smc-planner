/**
 * Validates the requirement data files.
 *
 * Run via `npm run validate:data`. Also wired to `prebuild` and CI, so bad data
 * cannot ship. Exits non-zero with a readable report on any error.
 *
 * Schema violations are only half the job — the checks that matter most are the
 * referential and structural ones, which catch the class of mistake a type
 * checker cannot: a requirement pointing at a course that does not exist, a
 * prerequisite cycle that makes a plan impossible, or a major file sitting in
 * the repo that was never registered and therefore never shipped.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { catalogFileSchema, gePatternFileSchema, majorFileSchema } from "../lib/schema";
import type { Catalog, CourseCode, GePattern, Major, PrereqExpr, Requirement } from "../lib/types";

const ROOT = resolve(import.meta.dirname, "..");
const MAJORS_DIR = resolve(ROOT, "data/majors");

export type Problem = { level: "error" | "warning"; where: string; message: string };

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** Course codes reachable anywhere in a requirement tree, including in choices. */
function collectCourseCodes(requirement: Requirement): CourseCode[] {
  switch (requirement.kind) {
    case "course":
      return [requirement.code];
    case "all":
      return requirement.of.flatMap(collectCourseCodes);
    case "chooseN":
      return requirement.from.flatMap(collectCourseCodes);
    case "chooseAcrossGroups":
      return requirement.groups.flatMap((group) => group.from.flatMap(collectCourseCodes));
  }
}

function collectPrereqCodes(expr: PrereqExpr): CourseCode[] {
  if ("course" in expr) return [expr.course];
  if ("all" in expr) return expr.all.flatMap(collectPrereqCodes);
  if ("any" in expr) return expr.any.flatMap(collectPrereqCodes);
  return [];
}

/**
 * Structural checks on a requirement tree: a choice that asks for more items
 * than it offers can never be satisfied, and an empty choice means the eligible
 * course list has not been imported yet.
 */
export function checkRequirementTree(requirement: Requirement, where: string): Problem[] {
  const problems: Problem[] = [];

  switch (requirement.kind) {
    case "course":
      break;
    case "all":
      for (const child of requirement.of) {
        problems.push(...checkRequirementTree(child, where));
      }
      break;
    case "chooseN":
      if (requirement.from.length === 0) {
        problems.push({
          level: requirement.incomplete ? "warning" : "error",
          where,
          message: `"${requirement.label}" has no eligible courses${requirement.incomplete ? " yet — flagged incomplete, pending import" : " — impossible to satisfy"}`,
        });
      } else if (requirement.n > requirement.from.length) {
        // A flagged-incomplete list is expected to be short; the rule itself is
        // still correct, so this is a known gap rather than a broken requirement.
        problems.push({
          level: requirement.incomplete ? "warning" : "error",
          where,
          message: `"${requirement.label}" asks for ${requirement.n} of only ${requirement.from.length} option(s)${requirement.incomplete ? " — flagged incomplete, pending import" : " — impossible to satisfy"}`,
        });
      }
      for (const child of requirement.from) {
        problems.push(...checkRequirementTree(child, where));
      }
      break;
    case "chooseAcrossGroups":
      if (requirement.groups.length === 0) {
        problems.push({
          level: requirement.incomplete ? "warning" : "error",
          where,
          message: `"${requirement.label}" has no groups${requirement.incomplete ? " yet — flagged incomplete, pending import" : " — impossible to satisfy"}`,
        });
      } else if (requirement.n > requirement.groups.length) {
        problems.push({
          level: requirement.incomplete ? "warning" : "error",
          where,
          message: `"${requirement.label}" asks for ${requirement.n} courses from ${requirement.groups.length} distinct group(s)${requirement.incomplete ? " — flagged incomplete, pending import" : " — impossible to satisfy"}`,
        });
      }
      for (const group of requirement.groups) {
        for (const child of group.from) {
          problems.push(...checkRequirementTree(child, where));
        }
      }
      break;
  }

  return problems;
}

/**
 * Detects cycles in the prerequisite graph via depth-first search. A cycle
 * means no valid ordering of terms exists, so every plan touching those courses
 * is unsatisfiable — worth failing the build over.
 */
export function findPrereqCycles(catalog: Catalog): string[][] {
  const cycles: string[][] = [];
  const state = new Map<CourseCode, "visiting" | "done">();

  function visit(code: CourseCode, path: CourseCode[]): void {
    const seen = state.get(code);
    if (seen === "done") return;

    if (seen === "visiting") {
      cycles.push([...path.slice(path.indexOf(code)), code]);
      return;
    }

    state.set(code, "visiting");
    const course = catalog.courses[code];

    if (course?.prerequisites) {
      for (const prereq of collectPrereqCodes(course.prerequisites)) {
        if (catalog.courses[prereq]) {
          visit(prereq, [...path, code]);
        }
      }
    }

    state.set(code, "done");
  }

  for (const code of Object.keys(catalog.courses)) {
    visit(code, []);
  }

  return cycles;
}

export function checkCatalog(catalog: Catalog): Problem[] {
  const problems: Problem[] = [];

  for (const [code, course] of Object.entries(catalog.courses)) {
    if (course.prerequisites) {
      for (const prereq of collectPrereqCodes(course.prerequisites)) {
        if (!catalog.courses[prereq]) {
          problems.push({
            level: "error",
            where: `catalog: ${code}`,
            message: `prerequisite "${prereq}" is not in the catalog`,
          });
        }
        if (prereq === code) {
          problems.push({
            level: "error",
            where: `catalog: ${code}`,
            message: "is its own prerequisite",
          });
        }
      }
    }
  }

  for (const cycle of findPrereqCycles(catalog)) {
    problems.push({
      level: "error",
      where: "catalog",
      message: `prerequisite cycle: ${cycle.join(" → ")}`,
    });
  }

  return problems;
}

export function checkMajors(majors: Major[], catalog: Catalog): Problem[] {
  const problems: Problem[] = [];
  const slugs = new Set<string>();

  for (const major of majors) {
    if (slugs.has(major.slug)) {
      problems.push({ level: "error", where: major.slug, message: "duplicate major slug" });
    }
    slugs.add(major.slug);

    const targetKeys = new Set<string>();

    for (const target of major.targets) {
      const where = `${major.name} → ${target.school} ${target.degree}`;
      const key = `${target.school}|${target.degree}`;

      if (targetKeys.has(key)) {
        problems.push({ level: "error", where, message: "duplicate target" });
      }
      targetKeys.add(key);

      const codes = collectCourseCodes(target.requirement);

      if (codes.length === 0) {
        problems.push({ level: "error", where, message: "requirement tree references no courses" });
      }

      for (const code of codes) {
        if (!catalog.courses[code]) {
          problems.push({
            level: "error",
            where,
            message: `"${code}" is not in the catalog`,
          });
        }
      }

      const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
      for (const duplicate of new Set(duplicates)) {
        problems.push({
          level: "error",
          where,
          message: `"${duplicate}" appears more than once in the requirement tree`,
        });
      }

      problems.push(...checkRequirementTree(target.requirement, where));

      // Provenance is the guard against the class of error that put a human
      // physiology course in a mechanical engineering plan.
      if (target.provenance.verifiedOn === "1970-01-01") {
        problems.push({
          level: "warning",
          where,
          message: "provenance is unverified — check against the ASSIST agreement and set verifiedOn",
        });
      }
      if (!/agreement|assist\.org\/transfer/i.test(target.provenance.sourceUrl)) {
        problems.push({
          level: "warning",
          where,
          message: `sourceUrl "${target.provenance.sourceUrl}" is not a specific agreement URL`,
        });
      }
    }
  }

  return problems;
}

export function checkGePattern(pattern: GePattern, catalog: Catalog): Problem[] {
  const problems: Problem[] = [];
  const areaIds = new Set(pattern.areas.map((area) => area.id));

  for (const area of pattern.areas) {
    const where = `Cal-GETC ${area.id}`;

    for (const code of collectCourseCodes(area.requirement)) {
      if (!catalog.courses[code]) {
        problems.push({ level: "error", where, message: `"${code}" is not in the catalog` });
      }
    }

    for (const other of area.overlapsWith ?? []) {
      if (!areaIds.has(other)) {
        problems.push({
          level: "error",
          where,
          message: `overlapsWith references unknown area "${other}"`,
        });
      }
    }

    problems.push(...checkRequirementTree(area.requirement, where));
  }

  return problems;
}

/** Catches a major file that exists on disk but was never registered in data/majors/index.ts. */
export function checkMajorRegistration(registeredSlugs: string[]): Problem[] {
  const onDisk = readdirSync(MAJORS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));

  const registered = new Set(registeredSlugs);

  return onDisk
    .filter((slug) => !registered.has(slug))
    .map((slug) => ({
      level: "error" as const,
      where: "data/majors/index.ts",
      message: `data/majors/${slug}.json exists but is not registered, so it will not ship`,
    }));
}

export function main() {
  const problems: Problem[] = [];

  const catalogParsed = catalogFileSchema.safeParse(readJson(resolve(ROOT, "data/catalog.json")));
  const geParsed = gePatternFileSchema.safeParse(readJson(resolve(ROOT, "data/cal-getc.json")));

  const majorFileNames = readdirSync(MAJORS_DIR).filter((name) => name.endsWith(".json"));
  const majors: Major[] = [];

  for (const fileName of majorFileNames) {
    const parsed = majorFileSchema.safeParse(readJson(resolve(MAJORS_DIR, fileName)));

    if (!parsed.success) {
      console.error(`✗ data/majors/${fileName} failed schema validation:`);
      for (const issue of parsed.error.issues) {
        console.error(`    ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      process.exit(1);
    }

    if (parsed.data.slug !== fileName.replace(/\.json$/, "")) {
      problems.push({
        level: "error",
        where: `data/majors/${fileName}`,
        message: `slug "${parsed.data.slug}" does not match the filename`,
      });
    }

    majors.push(parsed.data as Major);
  }

  for (const [name, parsed] of [
    ["data/catalog.json", catalogParsed],
    ["data/cal-getc.json", geParsed],
  ] as const) {
    if (!parsed.success) {
      console.error(`✗ ${name} failed schema validation:`);
      for (const issue of parsed.error.issues) {
        console.error(`    ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      process.exit(1);
    }
  }

  const catalog = catalogParsed.data as Catalog;
  const gePattern = geParsed.data as GePattern;

  problems.push(...checkCatalog(catalog));
  problems.push(...checkMajors(majors, catalog));
  problems.push(...checkGePattern(gePattern, catalog));
  problems.push(...checkMajorRegistration(majors.map((major) => major.slug)));

  // The catalog is a full import of every SMC course, so an unreferenced entry
  // is normal and says nothing. What still matters is the reverse direction —
  // a requirement pointing at a course that does not exist — which
  // checkMajors and checkGePattern already cover as errors.
  //
  // The remaining risk is a *stale* reference that happens to resolve: a course
  // the catalog no longer offers under that code. Surface catalog entries whose
  // title marks them as superseded so a human can look.
  for (const [code, course] of Object.entries(catalog.courses)) {
    if (/\b(formerly|no longer offered|discontinued)\b/i.test(course.title)) {
      problems.push({
        level: "warning",
        where: "catalog",
        message: `"${code}" (${course.title}) looks superseded — check requirements referencing it`,
      });
    }
  }

  const errors = problems.filter((problem) => problem.level === "error");
  const warnings = problems.filter((problem) => problem.level === "warning");

  for (const warning of warnings) {
    console.warn(`  warning  ${warning.where}: ${warning.message}`);
  }
  for (const error of errors) {
    console.error(`  error    ${error.where}: ${error.message}`);
  }

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} error(s) in the data files`);
    process.exit(1);
  }

  const targetCount = majors.reduce((total, major) => total + major.targets.length, 0);
  console.log(
    `\n✓ data valid — ${Object.keys(catalog.courses).length} courses, ${majors.length} majors, ` +
      `${targetCount} targets, ${gePattern.areas.length} Cal-GETC areas` +
      (warnings.length > 0 ? ` (${warnings.length} warning(s))` : ""),
  );
}

// Only run when invoked directly, so tests can import the checks above.
if (process.argv[1] === import.meta.filename) {
  main();
}

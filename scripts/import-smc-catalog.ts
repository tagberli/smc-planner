/**
 * Imports the SMC course catalog and the Cal-GETC pattern.
 *
 * Usage:
 *   npm run import:smc             # write staged output to data/.staged/
 *   npm run import:smc -- --apply  # promote staged output to data/
 *   npm run import:smc -- --refresh  # ignore the disk cache and re-fetch
 *
 * Run by hand, never at build or request time. Output is staged first so the
 * change can be reviewed as a diff before it becomes committed data — an
 * importer that silently rewrites requirement data is exactly how a wrong plan
 * reaches a student.
 *
 * Two sources, each used for what it is authoritative about:
 *
 *  - the course finder gives titles, units, prerequisites and lab flags;
 *  - the Cal-GETC pattern page gives area membership.
 *
 * Membership must come from the pattern page even though its comma-shorthand is
 * harder to parse: the course pages are incomplete. ENGL 1D satisfies Area 1A
 * and ETH ST 7 satisfies Area 6, but neither course page says so, so trusting
 * the course pages alone silently drops eligible courses.
 *
 * The area STRUCTURE (how many courses, which groups, overlap rules) stays
 * hand-transcribed in data/cal-getc.json, since it is prose, not a list.
 */

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchCached } from "./lib/fetch-cache";
import { parseCourseFinderPage, parseSubjectList, type ParsedCourse } from "./lib/parse-course-finder";
import { parsePrereqLine } from "./lib/parse-prereq";
import {
  parseCalGetcPage,
  type ParsedGeArea,
  type ParsedGeGroup,
} from "./lib/parse-cal-getc";
import type { Catalog, CatalogCourse, GeArea, GePattern, Requirement } from "../lib/types";

const ROOT = resolve(import.meta.dirname, "..");
const STAGE_DIR = resolve(ROOT, "data/.staged");
const BASE_URL = "https://catalog.smc.edu/current/courses/subject-finder.php";
const CAL_GETC_URL = "https://catalog.smc.edu/current/cal-getc/";

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const shouldRefresh = args.has("--refresh");

const today = () => new Date().toISOString().slice(0, 10);

async function fetchAllCourses(): Promise<ParsedCourse[]> {
  const index = await fetchCached(BASE_URL, { refresh: shouldRefresh });
  const subjects = parseSubjectList(index);

  if (subjects.length === 0) {
    throw new Error("No subjects found — the course-finder page layout has probably changed.");
  }

  console.log(`Found ${subjects.length} subjects.`);

  const byCode = new Map<string, ParsedCourse>();
  let fetched = 0;

  for (const subject of subjects) {
    const url = `${BASE_URL}?subject=${encodeURIComponent(subject)}`;
    const html = await fetchCached(url, { refresh: shouldRefresh });

    for (const course of parseCourseFinderPage(html)) {
      // Cross-listed courses appear under several subjects; first wins, and the
      // records are identical where they overlap.
      if (!byCode.has(course.code)) {
        byCode.set(course.code, course);
      }
    }

    fetched += 1;
    if (fetched % 20 === 0) {
      console.log(`  ${fetched}/${subjects.length} subjects — ${byCode.size} courses so far`);
    }
  }

  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function buildCatalog(courses: ParsedCourse[]): Catalog {
  const knownCodes = new Set(courses.map((course) => course.code));
  const result: Record<string, CatalogCourse> = {};

  for (const course of courses) {
    const entry: CatalogCourse = { title: course.title, units: course.units };

    for (const line of course.requisiteLines) {
      const parsed = parsePrereqLine(line, knownCodes);
      if (parsed) {
        entry.prerequisites = parsed;
        break;
      }
    }

    if (course.hasLab) {
      entry.hasLab = true;
    }

    result[course.code] = entry;
  }

  return {
    meta: {
      sourceUrl: BASE_URL,
      catalogYear: "2026-2027",
      verifiedOn: today(),
      notes:
        "Imported by scripts/import-smc-catalog.ts from the SMC course finder. " +
        "termsOffered is not published on these pages and remains unset; the planner " +
        "treats an unset value as unknown rather than asserting availability.",
    },
    courses: result,
  };
}

/**
 * Indexes the parsed pattern page by the area ids this project uses.
 *
 * The page groups things differently from the requirement data: one "Area 1"
 * accordion holds groups 1A/1B/1C, "Area 3" holds "Group A"/"Group B" (which
 * are 3A and 3B), and "Area 5" holds 5A/5B/5C. Area 4's nineteen numbered
 * groups are the discipline groups and stay a list.
 */
function indexParsedAreas(parsed: ParsedGeArea[]) {
  const byAreaId = new Map<string, string[]>();
  const disciplineGroups = new Map<string, ParsedGeGroup[]>();

  for (const area of parsed) {
    const numbered = area.groups.filter((group) => /^Group \d+$/.test(group.label));

    if (numbered.length > 1) {
      // Area 4: numbered groups are discipline groups, not sub-areas.
      disciplineGroups.set(area.id, numbered);
      byAreaId.set(area.id, numbered.flatMap((group) => group.codes));
      continue;
    }

    if (area.groups.length === 1 && !/^Group /.test(area.groups[0].label)) {
      byAreaId.set(area.id, area.groups[0].codes);
      continue;
    }

    for (const group of area.groups) {
      const suffix = group.label.replace(/^Group\s+/, "").toUpperCase();
      // "Group A" inside Area 3 means 3A; "Group 1A" already carries its area.
      const key = /^\d/.test(suffix) ? suffix : `${area.id}${suffix}`;
      byAreaId.set(key, group.codes);
    }
  }

  return { byAreaId, disciplineGroups };
}

/**
 * Fills the eligible-course list of each Cal-GETC area, preserving the
 * hand-transcribed area structure and rules.
 *
 * Membership comes from the pattern page; each code is then checked against the
 * imported catalog, and anything unresolvable is dropped and reported rather
 * than written out to fail validation later.
 */
function fillGePattern(
  pattern: GePattern,
  parsed: ParsedGeArea[],
  catalog: Catalog,
): { pattern: GePattern; unresolved: string[] } {
  const { byAreaId, disciplineGroups } = indexParsedAreas(parsed);
  const unresolved = new Set<string>();

  const resolve = (codes: string[]): string[] =>
    [...new Set(codes)]
      .filter((code) => {
        if (catalog.courses[code]) return true;
        unresolved.add(code);
        return false;
      })
      .sort((a, b) => a.localeCompare(b));

  const optionsFor = (areaId: string): Requirement[] =>
    resolve(byAreaId.get(areaId) ?? []).map((code) => ({ kind: "course", code }));

  /** Area ids are carried on the requirement labels, e.g. "Area 3A — ...". */
  const areaIdFromLabel = (label: string, fallback: string): string => {
    const match = /Area\s+([0-9]+[A-C]?)/i.exec(label);
    return match ? match[1].toUpperCase() : fallback;
  };

  function fill(requirement: Requirement, areaId: string): Requirement {
    switch (requirement.kind) {
      case "course":
        return requirement;
      case "all":
        return {
          ...requirement,
          of: requirement.of.map((child) =>
            fill(child, areaIdFromLabel("label" in child ? child.label : "", areaId)),
          ),
        };
      case "chooseN": {
        const from = optionsFor(areaIdFromLabel(requirement.label, areaId));
        return from.length >= requirement.n
          ? { ...requirement, from, incomplete: undefined }
          : { ...requirement, from, incomplete: true };
      }
      case "chooseAcrossGroups": {
        const groups = (disciplineGroups.get(areaId) ?? [])
          .map((group) => ({
            label: group.label,
            from: resolve(group.codes).map((code): Requirement => ({ kind: "course", code })),
          }))
          // A group whose every course is no longer offered contributes nothing.
          .filter((group) => group.from.length > 0);

        return groups.length >= requirement.n
          ? { ...requirement, groups, incomplete: undefined }
          : { ...requirement, groups, incomplete: true };
      }
    }
  }

  const areas: GeArea[] = pattern.areas.map((area) => ({
    ...area,
    requirement: fill(area.requirement, area.id),
  }));

  return {
    pattern: {
      ...pattern,
      meta: {
        ...pattern.meta,
        sourceUrl: CAL_GETC_URL,
        verifiedOn: today(),
        notes:
          "Area structure (course counts, unit minimums, group rules, overlap rules) is " +
          "hand-transcribed from the published SMC Cal-GETC pattern. Eligible-course lists " +
          "are imported by scripts/import-smc-catalog.ts from that same page, which is " +
          "authoritative for area membership. Courses shown in parentheses on the page are " +
          "no longer offered and are excluded.",
      },
      areas,
    },
    unresolved: [...unresolved].sort(),
  };
}

/** Drops `incomplete: undefined` keys so the JSON stays clean. */
const prune = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function main() {
  const courses = await fetchAllCourses();
  console.log(`\nParsed ${courses.length} unique courses.`);

  const catalog = buildCatalog(courses);
  const existingPattern = JSON.parse(
    readFileSync(resolve(ROOT, "data/cal-getc.json"), "utf8"),
  ) as GePattern;

  const calGetcHtml = await fetchCached(CAL_GETC_URL, { refresh: shouldRefresh });
  const parsedAreas = parseCalGetcPage(calGetcHtml);

  if (parsedAreas.length === 0) {
    throw new Error("No Cal-GETC areas parsed — the pattern page layout has probably changed.");
  }

  const { pattern, unresolved } = fillGePattern(existingPattern, parsedAreas, catalog);

  mkdirSync(STAGE_DIR, { recursive: true });
  writeFileSync(
    resolve(STAGE_DIR, "catalog.json"),
    JSON.stringify(prune(catalog), null, 2) + "\n",
  );
  writeFileSync(
    resolve(STAGE_DIR, "cal-getc.json"),
    JSON.stringify(prune(pattern), null, 2) + "\n",
  );

  const withPrereqs = Object.values(catalog.courses).filter((c) => c.prerequisites).length;
  // Counts must recurse: Area 3 is an `all` of 3A and 3B, so a non-recursive
  // count reports zero for it and hides whether the import actually worked.
  const countOptions = (requirement: Requirement): number => {
    switch (requirement.kind) {
      case "course":
        return 1;
      case "all":
        return requirement.of.reduce((total, child) => total + countOptions(child), 0);
      case "chooseN":
        return requirement.from.length;
      case "chooseAcrossGroups":
        return requirement.groups.reduce((total, group) => total + group.from.length, 0);
    }
  };

  const areaCounts = pattern.areas
    .map((area) => `${area.id}:${countOptions(area.requirement)}`)
    .join(" ");

  console.log(`  ${Object.keys(catalog.courses).length} courses, ${withPrereqs} with prerequisites`);
  console.log(`  Cal-GETC courses per area — ${areaCounts}`);

  if (unresolved.length > 0) {
    // Codes the pattern page lists but the course finder does not carry. Almost
    // always a discontinued course or a page-formatting change; either way it is
    // reported rather than written out, so it cannot fail validation silently.
    console.warn(
      `\n  ${unresolved.length} Cal-GETC code(s) had no catalog entry and were dropped:\n    ` +
        unresolved.join(", "),
    );
  }

  console.log(`\nStaged to data/.staged/`);

  if (shouldApply) {
    cpSync(resolve(STAGE_DIR, "catalog.json"), resolve(ROOT, "data/catalog.json"));
    cpSync(resolve(STAGE_DIR, "cal-getc.json"), resolve(ROOT, "data/cal-getc.json"));
    console.log("Applied to data/. Review the diff, then run npm run validate:data.");
  } else {
    console.log("Review it, then re-run with --apply to promote it to data/.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

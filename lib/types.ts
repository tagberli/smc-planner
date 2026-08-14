/**
 * Core domain types for the planner.
 *
 * The central idea is that a requirement is a *tree*, not a list of course
 * codes. Real transfer requirements are full of choices — "one course from
 * Group A", "two courses from two different groups of nineteen" — and a flat
 * list cannot express any of them. Everything downstream (satisfaction,
 * prerequisites, the UI) reads this tree.
 */

/** A course code as printed in the SMC catalog, e.g. "MATH 7", "ENGL C1000". */
export type CourseCode = string;

export type TermType = "fall" | "winter" | "spring" | "summer";

export const TERM_TYPES: readonly TermType[] = ["fall", "winter", "spring", "summer"];

/**
 * A prerequisite expression.
 *
 * `note` is the deliberate escape hatch: real prerequisites include things like
 * "satisfactory score on the placement test" or "consent of instructor", which
 * cannot be checked against a course list. Recording them as advisory notes
 * keeps them visible to the student instead of silently dropping them, which is
 * what a course-codes-only model would do.
 */
export type PrereqExpr =
  | { course: CourseCode }
  | { all: PrereqExpr[] }
  | { any: PrereqExpr[] }
  | { note: string };

export type CatalogCourse = {
  title: string;
  units: number;
  prerequisites?: PrereqExpr;
  /** Omitted means "unknown" — the planner must not claim a term is invalid on a guess. */
  termsOffered?: TermType[];
  hasLab?: boolean;
};

export type Catalog = {
  meta: SourceMeta;
  courses: Record<CourseCode, CatalogCourse>;
};

/**
 * Where a piece of data came from and when it was last confirmed.
 *
 * Required on every requirement set. A transfer plan built from stale or
 * unsourced requirements can cost a student a semester, so the schema refuses
 * data that cannot say where it came from.
 */
export type SourceMeta = {
  sourceUrl: string;
  /** e.g. "2026-2027" */
  catalogYear: string;
  /** ISO date, e.g. "2026-08-13" */
  verifiedOn: string;
  verifiedBy?: string;
  notes?: string;
};

export type RequirementGroup = {
  label: string;
  from: Requirement[];
};

/**
 * Marks an option list as known-incomplete — the requirement is real and its
 * rule is correct, but the eligible courses have not all been imported yet.
 *
 * This exists so the difference between "these are the options" and "these are
 * the options we happen to have loaded" is explicit rather than implied. The
 * validator downgrades unsatisfiability to a warning for flagged nodes, and the
 * UI can tell the student the list is partial instead of presenting it as
 * authoritative.
 */
export type Incompletable = { incomplete?: boolean };

export type Requirement =
  | { kind: "course"; code: CourseCode }
  /** Every child must be satisfied. */
  | { kind: "all"; label: string; of: Requirement[] }
  /** Any `n` of the children, optionally also meeting a minimum unit total. */
  | ({
      kind: "chooseN";
      label: string;
      n: number;
      minUnits?: number;
      from: Requirement[];
    } & Incompletable)
  /**
   * `n` children, each drawn from a *different* group. Cal-GETC Area 4 requires
   * two courses from two different discipline groups out of nineteen; picking
   * two anthropology courses does not satisfy it.
   */
  | ({
      kind: "chooseAcrossGroups";
      label: string;
      n: number;
      groups: RequirementGroup[];
    } & Incompletable);

/**
 * One Cal-GETC area.
 *
 * `overlapsWith` encodes a rule that is easy to get wrong in both directions.
 * Most areas state a course "cannot be used to satisfy requirements in more
 * than one area", so the default is no overlap. Area 5C (laboratory) is the
 * explicit exception: its lab course may also be the 5A or 5B course.
 */
export type GeArea = {
  id: string;
  label: string;
  requirement: Requirement;
  overlapsWith?: string[];
};

export type GePattern = {
  meta: SourceMeta;
  name: string;
  areas: GeArea[];
};

export type MajorTarget = {
  school: string;
  degree: string;
  provenance: SourceMeta;
  requirement: Requirement;
};

export type Major = {
  name: string;
  slug: string;
  targets: MajorTarget[];
};

/** A course resolved against the catalog, ready to render. */
export type Course = {
  code: CourseCode;
  title: string;
  units: number;
  prerequisites?: PrereqExpr;
  termsOffered?: TermType[];
  hasLab?: boolean;
};

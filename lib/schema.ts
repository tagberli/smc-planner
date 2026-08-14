import { z } from "zod";
import type { PrereqExpr, Requirement } from "@/lib/types";

/**
 * Schemas for the data files.
 *
 * These are the single source of truth for data shape. The parse runs in
 * `scripts/validate-data.ts` (wired to `prebuild` and CI) rather than in the
 * app: the data is static and bundled at build time, so validating there
 * catches every error before it can ship while keeping zod out of the client
 * bundle.
 */

/**
 * A course code as printed in the SMC catalog.
 *
 * The real shapes are messier than they look: prefixes can be several words
 * ("AD JUS 1", "COM ST 21", "VAR PE 11A"), numbers can carry a C-ID style
 * letter prefix ("ENGL C1000") or a letter suffix ("CS 20A"), and a few carry a
 * space-separated suffix ("SOCIOL 2 S").
 */
export const courseCodeSchema = z
  .string()
  .regex(
    /^[A-Z][A-Z]*( [A-Z]+)* [A-Z]?\d+[A-Z]*( [A-Z])?$/,
    "must look like a course code, e.g. 'MATH 7' or 'AD JUS 1'",
  );

export const termTypeSchema = z.enum(["fall", "winter", "spring", "summer"]);

/**
 * Recursive schemas need an explicit type annotation and a getter, since the
 * schema refers to itself before it is fully defined.
 */
export const prereqExprSchema: z.ZodType<PrereqExpr> = z.lazy(() =>
  z.union([
    z.object({ course: courseCodeSchema }),
    z.object({ all: z.array(prereqExprSchema).min(1) }),
    z.object({ any: z.array(prereqExprSchema).min(2) }),
    z.object({ note: z.string().min(1) }),
  ]),
);

export const catalogCourseSchema = z.object({
  title: z.string().min(1),
  // SMC courses run 0.5–6 units; the ceiling is a smell test, not a rule.
  units: z.number().positive().max(10),
  prerequisites: prereqExprSchema.optional(),
  termsOffered: z.array(termTypeSchema).min(1).optional(),
  hasLab: z.boolean().optional(),
});

export const sourceMetaSchema = z.object({
  sourceUrl: z.url(),
  catalogYear: z.string().regex(/^\d{4}-\d{4}$/, "must look like '2026-2027'"),
  verifiedOn: z.iso.date(),
  verifiedBy: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export const catalogFileSchema = z.object({
  meta: sourceMetaSchema,
  courses: z.record(courseCodeSchema, catalogCourseSchema),
});

export const requirementSchema: z.ZodType<Requirement> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("course"), code: courseCodeSchema }),
    z.object({
      kind: z.literal("all"),
      label: z.string().min(1),
      of: z.array(requirementSchema).min(1),
    }),
    // `from` and `groups` may be empty: that is the honest representation of a
    // requirement whose eligible-course list has not been imported yet. The
    // validator reports those as gaps rather than the schema pretending they
    // are complete.
    z.object({
      kind: z.literal("chooseN"),
      label: z.string().min(1),
      n: z.number().int().positive(),
      minUnits: z.number().positive().optional(),
      from: z.array(requirementSchema),
      incomplete: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal("chooseAcrossGroups"),
      label: z.string().min(1),
      n: z.number().int().positive(),
      groups: z.array(z.object({ label: z.string().min(1), from: z.array(requirementSchema) })),
      incomplete: z.boolean().optional(),
    }),
  ]),
);

export const geAreaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  requirement: requirementSchema,
  overlapsWith: z.array(z.string().min(1)).optional(),
});

export const gePatternFileSchema = z.object({
  meta: sourceMetaSchema,
  name: z.string().min(1),
  areas: z.array(geAreaSchema).min(1),
});

export const majorTargetSchema = z.object({
  school: z.string().min(1),
  degree: z.string().min(1),
  provenance: sourceMetaSchema,
  requirement: requirementSchema,
});

export const majorFileSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/, "must be a kebab-case slug"),
  targets: z.array(majorTargetSchema).min(1),
});

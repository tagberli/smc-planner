import { describe, expect, it } from "vitest";
import {
  checkCatalog,
  checkGePattern,
  checkMajors,
  checkRequirementTree,
  findPrereqCycles,
  type Problem,
} from "@/scripts/validate-data";
import { catalogFileSchema, majorFileSchema, requirementSchema } from "@/lib/schema";
import {
  catalog,
  collectChoices,
  collectCourseCodes,
  collectRequiredCourseCodes,
  findMajor,
  findTarget,
  gePattern,
  getCourse,
  majors,
} from "@/lib/requirements";
import type { Catalog, GePattern, Major, Requirement } from "@/lib/types";

function fixtureCatalog(): Catalog {
  return {
    meta: {
      sourceUrl: "https://catalog.smc.edu/current/",
      catalogYear: "2026-2027",
      verifiedOn: "2026-08-13",
    },
    courses: {
      "MATH 7": { title: "Calculus 1", units: 5 },
      "MATH 8": { title: "Calculus 2", units: 5, prerequisites: { course: "MATH 7" } },
      "ECON 1": { title: "Principles of Microeconomics", units: 3 },
      "ECON 2": { title: "Principles of Macroeconomics", units: 3 },
    },
  };
}

const errorsOf = (problems: Problem[]) => problems.filter((p) => p.level === "error");

describe("schema", () => {
  it("accepts every committed data file", () => {
    expect(catalogFileSchema.safeParse(catalog).success).toBe(true);
    for (const major of majors) {
      expect(majorFileSchema.safeParse(major).success, major.slug).toBe(true);
    }
  });

  it("rejects a zero or negative unit count", () => {
    const data = fixtureCatalog();
    data.courses["MATH 7"].units = 0;
    expect(catalogFileSchema.safeParse(data).success).toBe(false);
  });

  it("rejects a code that is not shaped like a course code", () => {
    expect(requirementSchema.safeParse({ kind: "course", code: "not a course" }).success).toBe(
      false,
    );
  });

  it("requires provenance on a major target", () => {
    const withoutProvenance = {
      name: "Test",
      slug: "test",
      targets: [
        {
          school: "UCLA",
          degree: "B.S.",
          requirement: { kind: "course", code: "MATH 7" },
        },
      ],
    };
    expect(majorFileSchema.safeParse(withoutProvenance).success).toBe(false);
  });

  it("accepts a deeply nested requirement tree", () => {
    const nested: Requirement = {
      kind: "all",
      label: "Major prep",
      of: [
        { kind: "course", code: "MATH 7" },
        {
          kind: "chooseN",
          label: "One of",
          n: 1,
          from: [
            { kind: "course", code: "ECON 1" },
            { kind: "course", code: "ECON 2" },
          ],
        },
      ],
    };
    expect(requirementSchema.safeParse(nested).success).toBe(true);
  });
});

describe("requirement tree traversal", () => {
  const tree: Requirement = {
    kind: "all",
    label: "Major prep",
    of: [
      { kind: "course", code: "MATH 7" },
      { kind: "course", code: "MATH 8" },
      {
        kind: "chooseN",
        label: "One economics course",
        n: 1,
        from: [
          { kind: "course", code: "ECON 1" },
          { kind: "course", code: "ECON 2" },
        ],
      },
    ],
  };

  it("collects every reachable code, including inside choices", () => {
    expect(collectCourseCodes(tree).sort()).toEqual(["ECON 1", "ECON 2", "MATH 7", "MATH 8"]);
  });

  it("excludes choice options from the unconditionally-required set", () => {
    // The distinction that the old flat model could not make: a student takes
    // one of ECON 1 / ECON 2, not both, so neither is required outright.
    expect(collectRequiredCourseCodes(tree).sort()).toEqual(["MATH 7", "MATH 8"]);
  });

  it("surfaces choices separately so they are not silently dropped", () => {
    const choices = collectChoices(tree);
    expect(choices).toHaveLength(1);
    expect(choices[0].kind).toBe("chooseN");
  });
});

describe("requirement tree validation", () => {
  it("rejects a choice asking for more options than it offers", () => {
    const impossible: Requirement = {
      kind: "chooseN",
      label: "Two of one",
      n: 2,
      from: [{ kind: "course", code: "MATH 7" }],
    };
    expect(errorsOf(checkRequirementTree(impossible, "test"))).toHaveLength(1);
  });

  it("rejects Area 4 style rules that cannot draw from enough distinct groups", () => {
    const impossible: Requirement = {
      kind: "chooseAcrossGroups",
      label: "Two courses from two different groups",
      n: 2,
      groups: [{ label: "Economics", from: [{ kind: "course", code: "ECON 1" }] }],
    };
    expect(errorsOf(checkRequirementTree(impossible, "test"))).toHaveLength(1);
  });

  it("downgrades that to a warning when the list is flagged incomplete", () => {
    const pending: Requirement = {
      kind: "chooseAcrossGroups",
      label: "Two courses from two different groups",
      n: 2,
      incomplete: true,
      groups: [{ label: "Economics", from: [{ kind: "course", code: "ECON 1" }] }],
    };
    const problems = checkRequirementTree(pending, "test");
    expect(errorsOf(problems)).toHaveLength(0);
    expect(problems.filter((p) => p.level === "warning")).toHaveLength(1);
  });

  it("accepts a satisfiable choice", () => {
    const fine: Requirement = {
      kind: "chooseN",
      label: "One of two",
      n: 1,
      from: [
        { kind: "course", code: "ECON 1" },
        { kind: "course", code: "ECON 2" },
      ],
    };
    expect(checkRequirementTree(fine, "test")).toEqual([]);
  });
});

describe("prerequisite graph", () => {
  it("finds no cycles in the committed catalog", () => {
    expect(findPrereqCycles(catalog)).toEqual([]);
  });

  it("detects a direct cycle", () => {
    const data = fixtureCatalog();
    data.courses["MATH 7"].prerequisites = { course: "MATH 8" };
    expect(findPrereqCycles(data).length).toBeGreaterThan(0);
  });

  it("detects a cycle through an `any` branch", () => {
    const data = fixtureCatalog();
    data.courses["MATH 7"].prerequisites = {
      any: [{ course: "ECON 1" }, { course: "MATH 8" }],
    };
    expect(findPrereqCycles(data).length).toBeGreaterThan(0);
  });

  it("flags a course that is its own prerequisite", () => {
    const data = fixtureCatalog();
    data.courses["ECON 1"].prerequisites = { course: "ECON 1" };
    expect(errorsOf(checkCatalog(data)).some((p) => p.message.includes("own prerequisite"))).toBe(
      true,
    );
  });

  it("flags a prerequisite missing from the catalog", () => {
    const data = fixtureCatalog();
    data.courses["ECON 2"].prerequisites = { course: "PHYSCS 21" };
    expect(errorsOf(checkCatalog(data))[0].message).toContain("not in the catalog");
  });

  it("ignores a `note` prerequisite, which has no course to resolve", () => {
    const data = fixtureCatalog();
    data.courses["MATH 7"].prerequisites = { note: "satisfactory placement score" };
    expect(checkCatalog(data)).toEqual([]);
  });
});

describe("major validation", () => {
  function fixtureMajor(requirement: Requirement): Major {
    return {
      name: "Test Major",
      slug: "test-major",
      targets: [
        {
          school: "UCLA",
          degree: "B.S.",
          provenance: {
            sourceUrl: "https://assist.org/transfer/agreement/12345",
            catalogYear: "2026-2027",
            verifiedOn: "2026-08-13",
          },
          requirement,
        },
      ],
    };
  }

  it("catches a requirement referencing a course missing from the catalog", () => {
    const major = fixtureMajor({ kind: "course", code: "PHYSCS 21" });
    expect(errorsOf(checkMajors([major], fixtureCatalog()))[0].message).toContain(
      "not in the catalog",
    );
  });

  it("catches the same course listed twice in one requirement tree", () => {
    const major = fixtureMajor({
      kind: "all",
      label: "Major prep",
      of: [
        { kind: "course", code: "MATH 7" },
        { kind: "course", code: "MATH 7" },
      ],
    });
    expect(errorsOf(checkMajors([major], fixtureCatalog()))[0].message).toContain(
      "more than once",
    );
  });

  it("catches a duplicate major slug", () => {
    const major = fixtureMajor({ kind: "course", code: "MATH 7" });
    expect(
      errorsOf(checkMajors([major, { ...major }], fixtureCatalog())).some((p) =>
        p.message.includes("duplicate major slug"),
      ),
    ).toBe(true);
  });

  it("warns when provenance is unverified", () => {
    const major = fixtureMajor({ kind: "course", code: "MATH 7" });
    major.targets[0].provenance.verifiedOn = "1970-01-01";

    const warnings = checkMajors([major], fixtureCatalog()).filter((p) => p.level === "warning");
    expect(warnings.some((p) => p.message.includes("unverified"))).toBe(true);
  });

  it("passes a well-formed major", () => {
    const major = fixtureMajor({
      kind: "all",
      label: "Major prep",
      of: [
        { kind: "course", code: "MATH 7" },
        { kind: "course", code: "MATH 8" },
      ],
    });
    expect(checkMajors([major], fixtureCatalog())).toEqual([]);
  });
});

describe("Cal-GETC pattern", () => {
  it("catches an overlapsWith pointing at an area that does not exist", () => {
    const pattern: GePattern = {
      meta: gePattern.meta,
      name: "Test",
      areas: [
        {
          id: "5C",
          label: "Lab",
          overlapsWith: ["5A"],
          requirement: { kind: "course", code: "MATH 7" },
        },
      ],
    };
    expect(errorsOf(checkGePattern(pattern, fixtureCatalog()))[0].message).toContain(
      "unknown area",
    );
  });

  it("models 5C as the only area permitted to overlap", () => {
    const overlapping = gePattern.areas.filter((area) => area.overlapsWith?.length);
    expect(overlapping.map((area) => area.id)).toEqual(["5C"]);
    expect(overlapping[0].overlapsWith).toEqual(["5A", "5B"]);
  });

  it("models Area 4 as requiring two distinct discipline groups", () => {
    const area4 = gePattern.areas.find((area) => area.id === "4");
    expect(area4?.requirement.kind).toBe("chooseAcrossGroups");
    if (area4?.requirement.kind === "chooseAcrossGroups") {
      expect(area4.requirement.n).toBe(2);
    }
  });

  it("does not treat GE areas as courses", () => {
    // The old model stored "IGETC 1A" in the course catalog as if a student
    // could enrol in it. Areas are requirements; they must never be courses.
    for (const code of Object.keys(catalog.courses)) {
      expect(code).not.toMatch(/^(IGETC|CALGETC|CAL-GETC)\b/);
    }
  });
});

describe("committed data", () => {
  it("resolves every required course against the catalog", () => {
    for (const major of majors) {
      for (const target of major.targets) {
        for (const code of collectCourseCodes(target.requirement)) {
          const course = getCourse(code);
          expect(course.title.length).toBeGreaterThan(0);
          expect(course.units).toBeGreaterThan(0);
        }
      }
    }
  });

  it("does not list Human Physiology as engineering major prep", () => {
    const mechE = findMajor("mechanical-engineering");
    const codes = mechE!.targets.flatMap((target) => collectCourseCodes(target.requirement));
    expect(codes).not.toContain("PHYS 3");
  });

  it("resolves a target by school name alone and by the full label", () => {
    const major = findMajor("computer-science");
    expect(findTarget(major, "UCLA")?.school).toBe("UCLA");
    expect(findTarget(major, "UCLA, CS B.S")?.school).toBe("UCLA");
    expect(findTarget(major, "Nowhere")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { expandCourseList, stripParentheticals } from "./parse-cal-getc";

describe("stripParentheticals", () => {
  it("removes nested parentheses", () => {
    expect(stripParentheticals("A (b (c) d) e")).toBe("A  e");
  });
});

describe("expandCourseList", () => {
  it("carries the discipline prefix across bare numbers", () => {
    expect(expandCourseList("ANTHRO 2, 3, 4, 7, 14")).toEqual([
      "ANTHRO 2",
      "ANTHRO 3",
      "ANTHRO 4",
      "ANTHRO 7",
      "ANTHRO 14",
    ]);
  });

  it("handles multi-word discipline prefixes", () => {
    expect(expandCourseList("AD JUS 1")).toEqual(["AD JUS 1"]);
    expect(expandCourseList("COM ST 9, 20, 30")).toEqual(["COM ST 9", "COM ST 20", "COM ST 30"]);
    expect(expandCourseList("TH ART 2, 5")).toEqual(["TH ART 2", "TH ART 5"]);
  });

  it("switches prefix when a new discipline appears", () => {
    expect(expandCourseList("GEOG 2, 7, ENVRN 7, GLOBAL 11")).toEqual([
      "GEOG 2",
      "GEOG 7",
      "ENVRN 7",
      "GLOBAL 11",
    ]);
  });

  it("drops annotations without losing the following course", () => {
    // Verbatim from Area 1A: the annotation sits between the two courses.
    expect(expandCourseList("ENGL C1000 (formerly ENGL 1) or 1D")).toEqual([
      "ENGL C1000",
      "ENGL 1D",
    ]);
  });

  it("excludes courses written in parentheses, which are no longer offered", () => {
    // The catalog's symbol key: "Course in parenthesis is no longer offered."
    // Scheduling one would send a student to a course that does not run.
    expect(expandCourseList("PHILOS (48)")).toEqual([]);
    expect(expandCourseList("POL SC 2, 3, 7, (8), (14), 21")).toEqual([
      "POL SC 2",
      "POL SC 3",
      "POL SC 7",
      "POL SC 21",
    ]);
  });

  it("ignores instruction prose glued to the first course", () => {
    expect(expandCourseList("Select 1 course ENGL C1001 HIST 47")).toEqual([
      "ENGL C1001",
      "HIST 47",
    ]);
  });

  it("does not read a number out of instruction prose", () => {
    // "1 course is required from 5B" must not become a course.
    expect(
      expandCourseList("Two courses: 1 course is required from 5A; 1 course is required from 5B"),
    ).toEqual([]);
  });

  it("breaks prefix inheritance across a prose sentence", () => {
    // The trailing "9" belongs to no discipline once prose intervenes.
    expect(expandCourseList("CHEM 10, 11, Note: a terminal GE course, 9")).toEqual([
      "CHEM 10",
      "CHEM 11",
    ]);
  });

  it("keeps lettered and C-ID course numbers", () => {
    expect(expandCourseList("ECON C2001, C2002, 4")).toEqual([
      "ECON C2001",
      "ECON C2002",
      "ECON 4",
    ]);
    expect(expandCourseList("SOCIOL 1, 2s, 4")).toEqual(["SOCIOL 1", "SOCIOL 2s", "SOCIOL 4"]);
  });
});

describe("prefix inheritance after a discontinued course", () => {
  it("re-anchors the prefix when a discipline's only listed course is parenthesised", () => {
    // Verbatim shape from Area 3B: "ENGL (2)" is discontinued, so stripping it
    // leaves a bare "ENGL". If that does not become the prefix, every following
    // number is silently attributed to ECON — which produced 30 phantom
    // "ECON 3 … ECON 64" codes on the first import run.
    expect(
      expandCourseList("COM ST 12 ECON 15 (same as HIST 15) ENGL (2), C1001, C1002, 3, 4"),
    ).toEqual(["COM ST 12", "ECON 15", "ENGL C1001", "ENGL C1002", "ENGL 3", "ENGL 4"]);
  });

  it("does not treat annotation words as disciplines", () => {
    expect(expandCourseList("CHEM 10, 11, NOTE 9")).toEqual(["CHEM 10", "CHEM 11"]);
  });
});

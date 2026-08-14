import { describe, expect, it } from "vitest";
import { parsePrereqLine, tokenizePrereq } from "./parse-prereq";

const known = new Set([
  "MATH 2",
  "MATH 3",
  "MATH 4",
  "MATH 7",
  "MATH 8",
  "ENGL C1000",
  "ESL 19B",
  "AD JUS 1",
  "COM ST 9",
]);

describe("tokenizePrereq", () => {
  it("matches multi-word course prefixes", () => {
    // "AD JUS 1" would be split into garbage by a naive /[A-Z]+ \d+/ scan.
    expect(tokenizePrereq("AD JUS 1 and COM ST 9", known)).toEqual([
      { type: "course", code: "AD JUS 1" },
      { type: "and" },
      { type: "course", code: "COM ST 9" },
    ]);
  });

  it("does not match a code that is a prefix of a longer number", () => {
    // "MATH 7" must not match inside "MATH 70".
    const tokens = tokenizePrereq("MATH 70", known);
    expect(tokens.some((token) => token.type === "course")).toBe(false);
  });
});

describe("parsePrereqLine", () => {
  it("parses a single course", () => {
    expect(parsePrereqLine("Prerequisite: MATH 7.", known)).toEqual({ course: "MATH 7" });
  });

  it("parses the real MATH 7 prerequisite, with precedence", () => {
    // From the SMC catalog: "MATH 2 or (MATH 3 and MATH 4)."
    expect(parsePrereqLine("Prerequisite: MATH 2 or (MATH 3 and MATH 4).", known)).toEqual({
      any: [{ course: "MATH 2" }, { all: [{ course: "MATH 3" }, { course: "MATH 4" }] }],
    });
  });

  it("binds `and` tighter than `or` without parentheses", () => {
    expect(parsePrereqLine("Prerequisite: MATH 3 and MATH 4 or MATH 2.", known)).toEqual({
      any: [{ all: [{ course: "MATH 3" }, { course: "MATH 4" }] }, { course: "MATH 2" }],
    });
  });

  it("keeps uncheckable prose as an advisory note rather than dropping it", () => {
    const parsed = parsePrereqLine(
      "Prerequisite: ENGL C1000 or satisfactory score on the placement test.",
      known,
    );
    expect(parsed).toEqual({
      any: [{ course: "ENGL C1000" }, { note: "satisfactory score on the placement test" }],
    });
  });

  it("handles a plural 'Prerequisites:' label", () => {
    expect(parsePrereqLine("Prerequisites: MATH 7 and MATH 8", known)).toEqual({
      all: [{ course: "MATH 7" }, { course: "MATH 8" }],
    });
  });

  it("ignores advisories and corequisites, which are not hard gates", () => {
    expect(parsePrereqLine("Advisory: MATH 7.", known)).toBeUndefined();
    expect(parsePrereqLine("Corequisite: MATH 8.", known)).toBeUndefined();
  });

  it("returns undefined for an empty prerequisite", () => {
    expect(parsePrereqLine("Prerequisite:", known)).toBeUndefined();
  });

  it("treats a wholly unparseable prerequisite as a note", () => {
    expect(parsePrereqLine("Prerequisite: consent of instructor.", known)).toEqual({
      note: "consent of instructor",
    });
  });
});

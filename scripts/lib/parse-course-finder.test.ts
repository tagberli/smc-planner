import { describe, expect, it } from "vitest";
import { parseCourseFinderPage, parseGeAreas, splitRequisiteClauses } from "./parse-course-finder";

/**
 * The area strings below are verbatim from the live SMC catalog. They are the
 * whole reason this parser needs tests: reading "+ LAB" literally as an area id
 * left Cal-GETC Area 5C with 5 courses instead of 40, and the "and 6" shape
 * left Area 6 completely empty.
 */
describe("parseGeAreas", () => {
  it("reads a plain area", () => {
    expect(parseGeAreas("Cal-GETC Area 3B (Humanities)")).toEqual(["3B"]);
  });

  it("treats '+ LAB' as Area 5C", () => {
    expect(parseGeAreas("Cal-GETC Area 5A (Physical Sciences, + LAB)").sort()).toEqual([
      "5A",
      "5C",
    ]);
  });

  it("does not add a lab area for an explicitly non-lab course", () => {
    expect(parseGeAreas("Cal-GETC Area 5B (Biological Sciences, non-lab)")).toEqual(["5B"]);
  });

  it("reads both sides of an OR", () => {
    expect(
      parseGeAreas("Cal-GETC Area 3B (Humanities) OR Area 4 (Social & Behavioral Sciences)").sort(),
    ).toEqual(["3B", "4"]);
  });

  it("reads a second area named without repeating the word 'Area'", () => {
    expect(
      parseGeAreas(
        "Cal-GETC Area 4 (Social & Behavioral Sciences) and 6 (Ethnic Studies). Cal-GETC credit for ETH ST 1 starts effective Fall 2023.",
      ).sort(),
    ).toEqual(["4", "6"]);
  });

  it("ignores text that is not a Cal-GETC line", () => {
    expect(parseGeAreas("Maximum UC credit for MATH 7 and MATH 28 is one course.")).toEqual([]);
  });
});

describe("splitRequisiteClauses", () => {
  it("splits a run-on prerequisite and advisory into separate clauses", () => {
    expect(splitRequisiteClauses(["Prerequisite: ACCTG 2. Advisory: ACCTG 10C."])).toEqual([
      "Prerequisite: ACCTG 2.",
      "Advisory: ACCTG 10C.",
    ]);
  });

  it("drops lines with no requisite label", () => {
    expect(splitRequisiteClauses(["C-ID: MATH 221.", "This course covers..."])).toEqual([]);
  });
});

describe("parseCourseFinderPage", () => {
  const row = `
    <tr role="row">
      <th><div class="row-section"><span class="type">MATH 8</span></div></th>
      <td><div class="row-section multi-row">
        <div class="title-holder"><h2>Calculus 2</h2></div>
        <div class="details-holder">
          <span class="units-qty">5 units</span>
          <span class="transfer">Transfer: UC, CSU</span>
        </div>
        <p>C-ID: MATH 221.</p>
        <p>Cal-GETC Area 2 (Mathematical Concepts)</p>
        <ul><li>Prerequisite: MATH 7.</li></ul>
      </div></td>
    </tr>`;

  it("extracts code, title, units, area, transferability and requisites", () => {
    expect(parseCourseFinderPage(row)).toEqual([
      {
        code: "MATH 8",
        title: "Calculus 2",
        units: 5,
        geAreas: ["2"],
        requisiteLines: ["Prerequisite: MATH 7."],
        hasLab: false,
        transfersToUC: true,
      },
    ]);
  });

  it("skips rows missing a title or units rather than inventing them", () => {
    const partial = `<tr><th><span class="type">MATH 9</span></th><td></td></tr>`;
    expect(parseCourseFinderPage(partial)).toEqual([]);
  });

  it("marks a CSU-only course as not UC transferable", () => {
    const csuOnly = row.replace("Transfer: UC, CSU", "Transfer: CSU");
    expect(parseCourseFinderPage(csuOnly)[0].transfersToUC).toBe(false);
  });
});

/**
 * Parses the published Cal-GETC pattern page into area → group → course codes.
 *
 * This page is the authoritative source for *membership* (which courses satisfy
 * which area). The course-finder pages are authoritative for titles, units and
 * prerequisites, but they are not complete for membership: ENGL 1D satisfies
 * Area 1A and ETH ST 7 satisfies Area 6, yet neither course page states it.
 * Relying only on the course pages silently drops those courses.
 *
 * The list format is a shorthand where a discipline prefix carries across
 * following bare numbers:
 *
 *   "ANTHRO 2, 3, 4 (satisfies area if completed fall 2014 or later), 7, 14"
 *     → ANTHRO 2, ANTHRO 3, ANTHRO 4, ANTHRO 7, ANTHRO 14
 *
 * Parenthesised text is removed before parsing. That handles both annotations
 * ("(same as ENVRN 4)", "(formerly ENGL 1)") and, deliberately, courses written
 * in parentheses: per the catalog's own symbol key, "Course in parenthesis is
 * no longer offered", so "PHILOS (48)" must yield nothing — a planner must
 * never schedule a course a student cannot enrol in.
 */

export type ParsedGeGroup = { label: string; codes: string[] };
export type ParsedGeArea = { id: string; heading: string; groups: ParsedGeGroup[] };

const decode = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

/** Removes parenthesised spans, including nested ones, left to right. */
export function stripParentheticals(text: string): string {
  let result = "";
  let depth = 0;

  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) result += char;
  }

  return result;
}

/**
 * Expands one shorthand list into full course codes.
 *
 * A token of all-caps words followed by a number starts a new prefix; a bare
 * number reuses the prefix currently in effect.
 */
export function expandCourseList(text: string): string[] {
  const cleaned = stripParentheticals(decode(text))
    .replace(/\b(?:or|and)\b/gi, ",")
    .replace(/\s+/g, " ");

  // An all-caps discipline prefix, optionally followed by a course number.
  // Prefixes can be multi-word ("AD JUS 1", "TH ART 2", "COM ST 21"). The
  // number is optional because a discipline can appear with no usable course —
  // "ENGL (2)" leaves a bare "ENGL" once the discontinued course is stripped,
  // and that still has to become the prefix for the numbers that follow.
  const codeOrPrefix = /\b([A-Z][A-Z]+(?: [A-Z]+)*)(?: ([A-Z]?\d+[A-Za-z]?))?\b/g;

  // All-caps words that appear in the lists but are not disciplines.
  const notDisciplines = new Set([
    "NOTE",
    "LAB",
    "GC",
    "UC",
    "CSU",
    "GETC",
    "IGETC",
    "AREA",
    "GROUP",
    "OR",
    "AND",
  ]);

  const codes: string[] = [];
  let prefix: string | undefined;

  for (const rawChunk of cleaned.split(",")) {
    const chunk = rawChunk.trim().replace(/[.;:]+$/, "");
    if (!chunk) continue;

    // Scan in order, since instruction prose and bare disciplines are often
    // glued to codes within one chunk ("Select 1 course ENGL C1000").
    const matches = [...chunk.matchAll(codeOrPrefix)].filter(
      (match) => !notDisciplines.has(match[1]),
    );

    // A bare discipline (no number) only counts in a chunk that is a course
    // list, not prose. Otherwise "a terminal GE course, 9" would read "GE" as a
    // discipline and turn the following number into "GE 9".
    const isProse = /\b[a-z]{3,}\b/.test(chunk);
    let matchedSomething = false;

    for (const match of matches) {
      if (match[2]) {
        prefix = match[1];
        codes.push(`${prefix} ${match[2]}`);
        matchedSomething = true;
      } else if (!isProse) {
        prefix = match[1];
        matchedSomething = true;
      }
    }

    if (matchedSomething) {
      continue;
    }

    // A bare number inherits the prefix in effect — but only when the chunk is
    // nothing but that number. Requiring the whole chunk to match keeps prose
    // like "1 course is required from 5B" from being read as a course.
    const bare = /^([A-Z]?\d+[A-Za-z]?)$/.exec(chunk);
    if (bare && prefix) {
      codes.push(`${prefix} ${bare[1]}`);
      continue;
    }

    // Prose that yielded nothing breaks the inheritance chain, so a number in a
    // later sentence is never silently attached to an earlier discipline.
    if (isProse) {
      prefix = undefined;
    }
  }

  return [...new Set(codes)];
}

/**
 * Splits the pattern page into areas and their groups.
 *
 * Each area is one accordion; groups within it are marked "Group 1:",
 * "Group 1A: English Composition", and so on. An area with no group markers is
 * treated as a single unnamed group.
 */
export function parseCalGetcPage(html: string): ParsedGeArea[] {
  const areas: ParsedGeArea[] = [];
  const sections = html.split(/class="accordion__toggle"/i).slice(1);

  for (const section of sections) {
    const headingMatch = />(.*?)<\/button>/s.exec(section);
    if (!headingMatch) continue;

    const heading = decode(headingMatch[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    const areaMatch = /^Area\s+(\d+)\s*:/i.exec(heading);
    if (!areaMatch) continue;

    const body = (section.split("</button>")[1] ?? "").split(/<button/)[0];
    // Turn markup into a flat line stream so "Group N:" markers are visible.
    const text = decode(body.replace(/<[^>]+>/g, "\n"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");

    const groups: ParsedGeGroup[] = [];
    // Group markers come in three shapes across the page: "Group 1:" (Area 4),
    // "Group 1A:" (Area 1, Area 5) and "Group A:" (Area 3).
    const markers = [...text.matchAll(/Group\s+(\d*[A-Z]?)\s*:/g)].filter(
      (marker) => marker[1].length > 0,
    );

    if (markers.length === 0) {
      groups.push({ label: heading, codes: expandCourseList(text) });
    } else {
      for (const [index, marker] of markers.entries()) {
        const start = marker.index + marker[0].length;
        const end = index + 1 < markers.length ? markers[index + 1].index : text.length;
        groups.push({
          label: `Group ${marker[1]}`,
          codes: expandCourseList(text.slice(start, end)),
        });
      }
    }

    areas.push({ id: areaMatch[1], heading, groups });
  }

  return areas;
}

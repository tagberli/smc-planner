/**
 * Parses SMC's course-finder pages into structured course records.
 *
 * Each course is one table row of the form:
 *
 *   <th><span class="type">MATH 8</span></th>
 *   <td>
 *     <h2>Calculus 2</h2>
 *     <span class="units-qty">5 units</span>
 *     <span class="transfer">Transfer: UC, CSU</span>
 *     <p>C-ID: MATH 221.</p>
 *     <p>Cal-GETC Area 2 (Mathematical Concepts)</p>
 *     <ul><li>Prerequisite: MATH 7.</li></ul>
 *     ...
 *   </td>
 *
 * The Cal-GETC area is stated on the course itself, which is why this page is
 * the source for GE membership rather than the Cal-GETC pattern page: that page
 * lists courses in a comma-shorthand where bare numbers inherit the preceding
 * discipline prefix, which is far easier to misparse.
 */

export type ParsedCourse = {
  code: string;
  title: string;
  units: number;
  /** Cal-GETC area ids stated on the course, e.g. ["2"], ["5B", "5C"]. */
  geAreas: string[];
  /** Raw requisite lines ("Prerequisite: ...", "Advisory: ...") in page order. */
  requisiteLines: string[];
  hasLab: boolean;
  transfersToUC: boolean;
};

const stripTags = (html: string) => html.replace(/<[^>]+>/g, "");

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/g, " ");
}

const clean = (html: string) => decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();

/**
 * Extracts Cal-GETC area ids from a course's area lines.
 *
 * The catalog uses several shapes, all of which appear in the live data:
 *
 *   "Cal-GETC Area 5B (Biological Sciences, non-lab)"        → ["5B"]
 *   "Cal-GETC Area 5A (Physical Sciences, + LAB)"            → ["5A", "5C"]
 *   "Cal-GETC Area 3B (Humanities) OR Area 4 (Social ...)"   → ["3B", "4"]
 *   "Cal-GETC Area 4 (Social ...) and 6 (Ethnic Studies)."   → ["4", "6"]
 *
 * Note the lab component is written "+ LAB", never "5C" — reading it literally
 * is how an entire Cal-GETC area ends up empty.
 */
export function parseGeAreas(text: string): string[] {
  const areas = new Set<string>();

  if (!/Cal-?GETC/i.test(text)) {
    return [];
  }

  for (const match of text.matchAll(/\bArea\s+([0-9]+[A-C]?)/gi)) {
    areas.add(match[1].toUpperCase());
  }

  // "Area 4 (Social & Behavioral Sciences) and 6 (Ethnic Studies)" — the second
  // area is named without repeating the word "Area".
  for (const match of text.matchAll(/\b(?:and|or)\s+([0-9]+[A-C]?)\s*\(/gi)) {
    areas.add(match[1].toUpperCase());
  }

  // The laboratory component (Area 5C) is flagged as "+ LAB".
  if (/\+\s*LAB\b/i.test(text)) {
    areas.add("5C");
  }

  return [...areas];
}

/**
 * Splits requisite text into one clause per label.
 *
 * The catalog sometimes runs them together — "Prerequisite: ACCTG 2. Advisory:
 * ACCTG 10C." — and treating that as a single prerequisite line would fold the
 * advisory into the hard prerequisite expression.
 */
export function splitRequisiteClauses(lines: string[]): string[] {
  const clauses: string[] = [];

  for (const line of lines) {
    if (!/(Prerequisite|Corequisite|Advisory)/i.test(line)) {
      continue;
    }

    for (const part of line.split(/(?=\b(?:Prerequisite|Corequisite|Advisory)s?\(?s?\)?\s*:)/i)) {
      const clause = part.trim().replace(/^[.\s]+/, "");
      if (/^(Prerequisite|Corequisite|Advisory)/i.test(clause)) {
        clauses.push(clause);
      }
    }
  }

  return [...new Set(clauses)];
}

export function parseCourseFinderPage(html: string): ParsedCourse[] {
  const courses: ParsedCourse[] = [];
  const rows = html.split(/<tr[^>]*>/i).slice(1);

  for (const row of rows) {
    const codeMatch = /<span class="type">\s*([^<]+?)\s*<\/span>/i.exec(row);
    const titleMatch = /<h2>\s*(.*?)\s*<\/h2>/is.exec(row);
    const unitsMatch = /<span class="units-qty">\s*([\d.]+)\s*units?\s*<\/span>/i.exec(row);

    if (!codeMatch || !titleMatch || !unitsMatch) {
      continue;
    }

    const code = clean(codeMatch[1]);
    const title = clean(titleMatch[1]);
    const units = Number(unitsMatch[1]);

    if (!code || !title || !Number.isFinite(units) || units <= 0) {
      continue;
    }

    const paragraphs = [...row.matchAll(/<p>(.*?)<\/p>/gis)].map((match) => clean(match[1]));
    const listItems = [...row.matchAll(/<li>(.*?)<\/li>/gis)].map((match) => clean(match[1]));
    // Some rows put requisites in a bare <ul> without <li> wrappers. Prefer the
    // <li>s when they exist, or the same text is captured twice — once split
    // and once as one run-on line.
    const bareLists =
      listItems.length > 0
        ? []
        : [...row.matchAll(/<ul>(.*?)<\/ul>/gis)].map((match) => clean(match[1]));

    const requisiteLines = splitRequisiteClauses([...listItems, ...bareLists, ...paragraphs]);

    const areaText = paragraphs.filter((line) => /Cal-?GETC/i.test(line)).join(" ");
    const transferMatch = /<span class="transfer">\s*(.*?)\s*<\/span>/is.exec(row);
    const transferText = transferMatch ? clean(transferMatch[1]) : "";

    courses.push({
      code,
      title,
      units,
      geAreas: parseGeAreas(areaText),
      requisiteLines: [...new Set(requisiteLines)],
      // "+ LAB" is the catalog's own lab marker; "non-lab" explicitly is not one.
      hasLab: /\+\s*LAB\b/i.test(areaText) || /\blab\b/i.test(title),
      transfersToUC: /\bUC\b/.test(transferText),
    });
  }

  return courses;
}

/** Subject names from the course-finder's subject dropdown. */
export function parseSubjectList(html: string): string[] {
  const select = /<select[^>]*>(.*?)<\/select>/is.exec(html);
  if (!select) return [];

  return [...select[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>/gi)]
    .map((match) => decodeEntities(match[1]).trim())
    .filter((value) => value.length > 0);
}

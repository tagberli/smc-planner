import type { PrereqExpr } from "../../lib/types";

/**
 * Parses SMC catalog prerequisite prose into a `PrereqExpr`.
 *
 * The catalog writes prerequisites as short boolean prose:
 *
 *   "MATH 7."
 *   "MATH 2 or (MATH 3 and MATH 4)."
 *   "ENGL C1000 or ESL 19B, and satisfactory score on the placement test."
 *
 * Grammar (standard precedence, `and` binds tighter than `or`):
 *
 *   expr   := term ("or" term)*
 *   term   := factor ("and" factor)*
 *   factor := "(" expr ")" | courseCode | prose
 *
 * Anything that is not a course code or an operator becomes a `{ note }`. That
 * is the whole point of the note variant: a requirement like "consent of
 * instructor" is real and must stay visible to the student, but it cannot be
 * checked against a list of completed courses. Dropping it silently would make
 * the planner claim a course is available when it is not.
 */

type Token =
  | { type: "course"; code: string }
  | { type: "and" }
  | { type: "or" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "prose"; text: string };

/**
 * Tokenizes against the set of course codes known to exist. Course prefixes can
 * contain spaces ("AD JUS 1", "COM ST 9"), so a purely regex-based split cannot
 * tell where a code ends — matching against known codes removes the ambiguity.
 */
export function tokenizePrereq(input: string, knownCodes: ReadonlySet<string>): Token[] {
  const tokens: Token[] = [];
  // Longest-first so "COM ST 9" wins over a hypothetical "COM ST 9" prefix clash.
  const codes = [...knownCodes].sort((a, b) => b.length - a.length);
  let rest = input;
  let prose = "";

  const flushProse = () => {
    const text = prose.trim().replace(/^[,;.\s]+|[,;.\s]+$/g, "");
    if (text) {
      tokens.push({ type: "prose", text });
    }
    prose = "";
  };

  while (rest.length > 0) {
    const matchedCode = codes.find(
      (code) => rest.startsWith(code) && !/^[A-Za-z0-9]/.test(rest.slice(code.length)),
    );

    if (matchedCode) {
      flushProse();
      tokens.push({ type: "course", code: matchedCode });
      rest = rest.slice(matchedCode.length);
      continue;
    }

    // Only treat "and"/"or" as operators at a real word start. Slicing the
    // input destroys the left-hand word boundary, so `\b` alone would match the
    // "or" inside "instructor".
    const atWordStart = prose.length === 0 || !/[A-Za-z0-9]$/.test(prose);
    const operator = atWordStart ? /^\s*(and|or)\b/i.exec(rest) : null;
    if (operator) {
      flushProse();
      tokens.push({ type: operator[1].toLowerCase() === "and" ? "and" : "or" });
      rest = rest.slice(operator[0].length);
      continue;
    }

    if (rest.startsWith("(")) {
      flushProse();
      tokens.push({ type: "lparen" });
      rest = rest.slice(1);
      continue;
    }

    if (rest.startsWith(")")) {
      flushProse();
      tokens.push({ type: "rparen" });
      rest = rest.slice(1);
      continue;
    }

    prose += rest[0];
    rest = rest.slice(1);
  }

  flushProse();
  return tokens;
}

function parseTokens(tokens: Token[]): PrereqExpr | undefined {
  let index = 0;

  const peek = () => tokens[index];

  function parseExpr(): PrereqExpr | undefined {
    const terms: PrereqExpr[] = [];
    const first = parseTerm();
    if (first) terms.push(first);

    while (peek()?.type === "or") {
      index += 1;
      const next = parseTerm();
      if (next) terms.push(next);
    }

    if (terms.length === 0) return undefined;
    return terms.length === 1 ? terms[0] : { any: terms };
  }

  function parseTerm(): PrereqExpr | undefined {
    const factors: PrereqExpr[] = [];
    const first = parseFactor();
    if (first) factors.push(first);

    while (peek()?.type === "and") {
      index += 1;
      const next = parseFactor();
      if (next) factors.push(next);
    }

    if (factors.length === 0) return undefined;
    return factors.length === 1 ? factors[0] : { all: factors };
  }

  function parseFactor(): PrereqExpr | undefined {
    const token = peek();
    if (!token) return undefined;

    if (token.type === "lparen") {
      index += 1;
      const inner = parseExpr();
      if (peek()?.type === "rparen") index += 1;
      return inner;
    }

    if (token.type === "course") {
      index += 1;
      return { course: token.code };
    }

    if (token.type === "prose") {
      index += 1;
      return { note: token.text };
    }

    // A stray operator or closing paren: skip it rather than looping forever.
    index += 1;
    return undefined;
  }

  return parseExpr();
}

/**
 * Extracts the prerequisite clause from a requisite line and parses it.
 * Returns undefined when the line is not a prerequisite (advisories and
 * corequisites are not hard gates and must not be treated as one).
 */
export function parsePrereqLine(
  line: string,
  knownCodes: ReadonlySet<string>,
): PrereqExpr | undefined {
  const match = /^\s*Prerequisite\(?s?\)?\s*:\s*(.+)$/i.exec(line);
  if (!match) return undefined;

  const body = match[1].trim().replace(/\.\s*$/, "");
  if (!body) return undefined;

  return parseTokens(tokenizePrereq(body, knownCodes));
}

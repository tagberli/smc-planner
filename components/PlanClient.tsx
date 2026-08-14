"use client";

import { ArrowLeft, Download, Info, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  collectChoices,
  collectRequiredCourseCodes,
  findMajor,
  findTarget,
  gePattern,
  getCourse,
  targetLabel,
  tryGetCourse,
} from "@/lib/requirements";
import { TERM_TYPES, type Course, type Requirement, type TermType } from "@/lib/types";

const termLabels: Record<TermType, string> = {
  fall: "Fall",
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
};

function formatCourse(course: Course) {
  return `${course.code} - ${course.title} (${course.units} units)`;
}

function courseListText(courses: Course[]) {
  if (courses.length === 0) {
    return "None";
  }

  return courses.map((course) => `- ${formatCourse(course)}`).join("\n");
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function PlanClient() {
  const searchParams = useSearchParams();
  const major = findMajor(searchParams.get("major"));
  const target = findTarget(major, searchParams.get("school"));
  const [completedCodes, setCompletedCodes] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Partial<Record<string, TermType>>>({});

  // Only the courses required no matter what the student chooses. Choice nodes
  // are shown separately until the picker lands, so the planner never implies a
  // student must take every option in a "choose one of fifteen" list.
  const requiredCourses = useMemo<Course[]>(() => {
    if (!target) {
      return [];
    }

    return collectRequiredCourseCodes(target.requirement).map(getCourse);
  }, [target]);

  const majorChoices = useMemo<Requirement[]>(
    () => (target ? collectChoices(target.requirement) : []),
    [target],
  );

  const completedCourses = requiredCourses.filter((course) => completedCodes.has(course.code));
  const remainingCourses = requiredCourses.filter((course) => !completedCodes.has(course.code));

  const plannedCourses = TERM_TYPES.reduce(
    (plans, term) => ({
      ...plans,
      [term]: remainingCourses.filter((course) => assignments[course.code] === term),
    }),
    {} as Record<TermType, Course[]>,
  );

  const termUnits = TERM_TYPES.reduce(
    (totals, term) => ({
      ...totals,
      [term]: plannedCourses[term].reduce((total, course) => total + course.units, 0),
    }),
    {} as Record<TermType, number>,
  );

  function toggleCompleted(code: string) {
    const shouldMarkCompleted = !completedCodes.has(code);

    setCompletedCodes((current) => {
      const next = new Set(current);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

    if (shouldMarkCompleted) {
      setAssignments((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });
    }
  }

  function assignCourse(code: string, term: TermType) {
    setAssignments((current) => ({ ...current, [code]: term }));
  }

  function clearAssignment(code: string) {
    setAssignments((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });
  }

  function exportPlan() {
    if (!major || !target) {
      return;
    }

    const unassigned = remainingCourses.filter((course) => !assignments[course.code]);
    const termSummaries = TERM_TYPES.flatMap((term) => [
      `${termLabels[term]} Plan (${termUnits[term]} units):`,
      courseListText(plannedCourses[term]),
      "",
    ]);

    const summary = [
      "SMC Ed Planner Summary",
      "",
      `Major: ${major.name}`,
      `Target: ${targetLabel(target)}`,
      `Requirements source: ${target.provenance.sourceUrl} (${target.provenance.catalogYear}, verified ${target.provenance.verifiedOn})`,
      "",
      "This plan is not advice. Confirm it against the official ASSIST agreement",
      "and with an SMC counselor before enrolling.",
      "",
      "Completed Courses:",
      courseListText(completedCourses),
      "",
      ...termSummaries,
      "Unassigned Remaining Courses:",
      courseListText(unassigned),
      "",
      "General education (Cal-GETC) is not yet included in this export — the",
      "eligible-course lists are still being imported.",
      "",
    ].join("\n");

    const filename = `smc-ed-plan-${major.slug}-${targetLabel(target)}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    downloadTextFile(`${filename}.txt`, summary);
  }

  if (!major || !target) {
    return (
      <main className="min-h-screen bg-slate-50">
        <section className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-10">
          <Link
            href="/"
            className="mb-6 inline-flex w-fit items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900"
          >
            <ArrowLeft aria-hidden="true" size={18} />
            Back
          </Link>
          <h1 className="text-3xl font-semibold text-slate-950">Plan not found</h1>
          <p className="mt-3 text-slate-600">
            Choose a major and target school from the home page to start a plan.
          </p>
        </section>
      </main>
    );
  }

  const isUnverified = target.provenance.verifiedOn === "1970-01-01";

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900"
            >
              <ArrowLeft aria-hidden="true" size={18} />
              Back
            </Link>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
              {targetLabel(target)}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">
              {major.name}
            </h1>
          </div>

          <button
            type="button"
            onClick={exportPlan}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Download aria-hidden="true" size={18} />
            Export Plan
          </button>
        </div>

        <Provenance
          sourceUrl={target.provenance.sourceUrl}
          catalogYear={target.provenance.catalogYear}
          verifiedOn={target.provenance.verifiedOn}
          isUnverified={isUnverified}
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <div className="space-y-8">
            <RequirementSection
              title="Major Requirements"
              courses={requiredCourses}
              completedCodes={completedCodes}
              onToggleCompleted={toggleCompleted}
            />
            {majorChoices.length > 0 ? (
              <ChoiceSection title="Major Electives" choices={majorChoices} />
            ) : null}
            <ChoiceSection
              title="General Education (Cal-GETC)"
              choices={gePattern.areas.map((area) => area.requirement)}
              labels={gePattern.areas.map((area) => area.label)}
            />
            <RemainingCourses
              courses={remainingCourses}
              assignments={assignments}
              onAssign={assignCourse}
              onClear={clearAssignment}
            />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-950">Semester Planner</h2>
              <span className="text-sm text-slate-500">{remainingCourses.length} remaining</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {TERM_TYPES.map((term) => (
                <TermColumn
                  key={term}
                  title={termLabels[term]}
                  courses={plannedCourses[term]}
                  units={termUnits[term]}
                  onClear={clearAssignment}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Provenance({
  sourceUrl,
  catalogYear,
  verifiedOn,
  isUnverified,
}: {
  sourceUrl: string;
  catalogYear: string;
  verifiedOn: string;
  isUnverified: boolean;
}) {
  return (
    <div
      className={`mb-8 flex gap-3 rounded-lg border p-4 text-sm ${
        isUnverified
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {isUnverified ? (
        <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      ) : (
        <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      )}
      <div>
        {isUnverified ? (
          <p className="font-semibold">
            These requirements have not been verified against an ASSIST agreement.
          </p>
        ) : (
          <p>
            Catalog year {catalogYear}, last verified {verifiedOn}.{" "}
            <a href={sourceUrl} className="font-semibold underline" rel="noreferrer noopener">
              View the source agreement
            </a>
            .
          </p>
        )}
        <p className={isUnverified ? "mt-1" : "mt-1 text-slate-500"}>
          This planner is not academic advice. Confirm every requirement with an SMC counselor
          and the official agreement on ASSIST before enrolling.
        </p>
      </div>
    </div>
  );
}

function RequirementSection({
  title,
  courses,
  completedCodes,
  onToggleCompleted,
}: {
  title: string;
  courses: Course[];
  completedCodes: Set<string>;
  onToggleCompleted: (code: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <span className="text-sm text-slate-500">
          {courses.filter((course) => completedCodes.has(course.code)).length}/{courses.length}
        </span>
      </div>
      <div className="space-y-3">
        {courses.map((course) => {
          const isCompleted = completedCodes.has(course.code);

          return (
            <label
              key={course.code}
              className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300"
            >
              <input
                type="checkbox"
                checked={isCompleted}
                onChange={() => onToggleCompleted(course.code)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>
                <span
                  className={`block text-sm font-semibold ${
                    isCompleted ? "text-slate-500 line-through" : "text-slate-950"
                  }`}
                >
                  {course.code}
                </span>
                <span className="block text-sm text-slate-600">{course.title}</span>
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  {course.units} units
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Requirements the student still has to choose within. Read-only for now: the
 * picker arrives with the planner UX work. Showing them as unresolved is the
 * point — the previous build silently omitted every choice-based requirement.
 */
function ChoiceSection({
  title,
  choices,
  labels,
}: {
  title: string;
  choices: Requirement[];
  labels?: string[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-slate-950">{title}</h2>
      <div className="space-y-3">
        {choices.map((choice, index) => (
          <ChoiceCard key={index} requirement={choice} heading={labels?.[index]} />
        ))}
      </div>
    </section>
  );
}

function ChoiceCard({ requirement, heading }: { requirement: Requirement; heading?: string }) {
  if (requirement.kind === "course") {
    const course = tryGetCourse(requirement.code);
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">{requirement.code}</p>
        {course ? <p className="text-sm text-slate-600">{course.title}</p> : null}
      </article>
    );
  }

  if (requirement.kind === "all") {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {heading ? <p className="text-sm font-semibold text-slate-950">{heading}</p> : null}
        <p className="text-sm text-slate-600">{requirement.label}</p>
        <div className="mt-3 space-y-3 border-l-2 border-slate-100 pl-3">
          {requirement.of.map((child, index) => (
            <ChoiceCard key={index} requirement={child} />
          ))}
        </div>
      </article>
    );
  }

  const optionCount =
    requirement.kind === "chooseN"
      ? requirement.from.length
      : requirement.groups.reduce((total, group) => total + group.from.length, 0);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {heading ? <p className="text-sm font-semibold text-slate-950">{heading}</p> : null}
      <p className="text-sm text-slate-600">{requirement.label}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          choose {requirement.n} of {optionCount}
        </span>
        {requirement.incomplete ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            course list incomplete
          </span>
        ) : null}
      </div>
    </article>
  );
}

function RemainingCourses({
  courses,
  assignments,
  onAssign,
  onClear,
}: {
  courses: Course[];
  assignments: Partial<Record<string, TermType>>;
  onAssign: (code: string, term: TermType) => void;
  onClear: (code: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-950">Remaining Courses</h2>
        <span className="text-sm text-slate-500">{courses.length} courses</span>
      </div>
      <div className="space-y-3">
        {courses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            All requirements are marked complete.
          </p>
        ) : (
          courses.map((course) => (
            <article
              key={course.code}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{course.code}</p>
                  <p className="text-sm text-slate-600">{course.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{course.units} units</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TERM_TYPES.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => onAssign(course.code, term)}
                      className={`h-9 rounded-md border px-3 text-sm font-semibold transition ${
                        assignments[course.code] === term
                          ? "border-teal-700 bg-teal-700 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-800"
                      }`}
                    >
                      {termLabels[term]}
                    </button>
                  ))}
                  {assignments[course.code] ? (
                    <button
                      type="button"
                      onClick={() => onClear(course.code)}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                    >
                      <RotateCcw aria-hidden="true" size={16} />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function TermColumn({
  title,
  courses,
  units,
  onClear,
}: {
  title: string;
  courses: Course[];
  units: number;
  onClear: (code: string) => void;
}) {
  return (
    <div className="min-h-64 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <p className="text-sm text-slate-500">{units} units</p>
        </div>
      </div>

      {courses.length === 0 ? (
        <p className="text-sm text-slate-500">No courses assigned.</p>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => (
            <article key={course.code} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{course.code}</p>
                  <p className="text-sm text-slate-600">{course.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{course.units} units</p>
                </div>
                <button
                  type="button"
                  onClick={() => onClear(course.code)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

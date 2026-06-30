"use client";

import { ArrowLeft, Download, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { findMajor, findTargetSchool, type Course } from "@/lib/requirements";

type RequirementType = "major" | "ge";
type Semester = "fall" | "winter" | "spring" | "summer";

type PlannerCourse = Course & {
  id: string;
  requirementType: RequirementType;
};

const semesters: Array<{ key: Semester; label: string }> = [
  { key: "fall", label: "Fall" },
  { key: "winter", label: "Winter" },
  { key: "spring", label: "Spring" },
  { key: "summer", label: "Summer" },
];

function buildCourseId(requirementType: RequirementType, course: Course, index: number) {
  return `${requirementType}-${course.code}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

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
  const majorName = searchParams.get("major");
  const schoolName = searchParams.get("school");
  const major = findMajor(majorName);
  const targetSchool = findTargetSchool(major, schoolName);
  const [completedCourseIds, setCompletedCourseIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Partial<Record<string, Semester>>>({});

  const courses = useMemo<PlannerCourse[]>(() => {
    if (!targetSchool) {
      return [];
    }

    const majorCourses = targetSchool.requiredCourses.map((course, index) => ({
      ...course,
      id: buildCourseId("major", course, index),
      requirementType: "major" as const,
    }));

    const geCourses = targetSchool.geRequirements.map((course, index) => ({
      ...course,
      id: buildCourseId("ge", course, index),
      requirementType: "ge" as const,
    }));

    return [...majorCourses, ...geCourses];
  }, [targetSchool]);

  const majorCourses = courses.filter((course) => course.requirementType === "major");
  const geCourses = courses.filter((course) => course.requirementType === "ge");
  const completedCourses = courses.filter((course) => completedCourseIds.has(course.id));
  const remainingCourses = courses.filter((course) => !completedCourseIds.has(course.id));
  const plannedCourses = semesters.reduce(
    (plans, semester) => ({
      ...plans,
      [semester.key]: remainingCourses.filter(
        (course) => assignments[course.id] === semester.key,
      ),
    }),
    {} as Record<Semester, PlannerCourse[]>,
  );

  const semesterUnits = semesters.reduce(
    (totals, semester) => ({
      ...totals,
      [semester.key]: plannedCourses[semester.key].reduce(
        (total, course) => total + course.units,
        0,
      ),
    }),
    {} as Record<Semester, number>,
  );

  function toggleCompleted(courseId: string) {
    const shouldMarkCompleted = !completedCourseIds.has(courseId);

    setCompletedCourseIds((currentCourseIds) => {
      const nextCourseIds = new Set(currentCourseIds);

      if (nextCourseIds.has(courseId)) {
        nextCourseIds.delete(courseId);
      } else {
        nextCourseIds.add(courseId);
      }

      return nextCourseIds;
    });

    if (shouldMarkCompleted) {
      setAssignments((currentAssignments) => {
        const nextAssignments = { ...currentAssignments };
        delete nextAssignments[courseId];
        return nextAssignments;
      });
    }
  }

  function assignCourse(courseId: string, semester: Semester) {
    setAssignments((currentAssignments) => ({
      ...currentAssignments,
      [courseId]: semester,
    }));
  }

  function clearAssignment(courseId: string) {
    setAssignments((currentAssignments) => {
      const nextAssignments = { ...currentAssignments };
      delete nextAssignments[courseId];
      return nextAssignments;
    });
  }

  function exportPlan() {
    const safeMajorName = major?.name ?? "Unknown Major";
    const safeSchoolName = targetSchool?.school ?? "Unknown School";
    const unassignedCourses = remainingCourses.filter((course) => !assignments[course.id]);
    const semesterSummaries = semesters.flatMap((semester) => [
      `${semester.label} Plan (${semesterUnits[semester.key]} units):`,
      courseListText(plannedCourses[semester.key]),
      "",
    ]);

    const summary = [
      "SMC Ed Planner Summary",
      "",
      `Major: ${safeMajorName}`,
      `Target School: ${safeSchoolName}`,
      "",
      "Completed Courses:",
      courseListText(completedCourses),
      "",
      ...semesterSummaries,
      "Unassigned Remaining Courses:",
      courseListText(unassignedCourses),
      "",
    ].join("\n");

    const filename = `smc-ed-plan-${safeMajorName}-${safeSchoolName}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    downloadTextFile(`${filename}.txt`, summary);
  }

  if (!major || !targetSchool) {
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
              {targetSchool.school}
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

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <div className="space-y-8">
            <RequirementSection
              title="Major Requirements"
              courses={majorCourses}
              completedCourseIds={completedCourseIds}
              onToggleCompleted={toggleCompleted}
            />
            <RequirementSection
              title="GE Requirements"
              courses={geCourses}
              completedCourseIds={completedCourseIds}
              onToggleCompleted={toggleCompleted}
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
              <span className="text-sm text-slate-500">
                {remainingCourses.length} remaining
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {semesters.map((semester) => (
                <SemesterColumn
                  key={semester.key}
                  title={semester.label}
                  courses={plannedCourses[semester.key]}
                  units={semesterUnits[semester.key]}
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

function RequirementSection({
  title,
  courses,
  completedCourseIds,
  onToggleCompleted,
}: {
  title: string;
  courses: PlannerCourse[];
  completedCourseIds: Set<string>;
  onToggleCompleted: (courseId: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <span className="text-sm text-slate-500">
          {courses.filter((course) => completedCourseIds.has(course.id)).length}/{courses.length}
        </span>
      </div>
      <div className="space-y-3">
        {courses.map((course) => {
          const isCompleted = completedCourseIds.has(course.id);

          return (
            <label
              key={course.id}
              className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300"
            >
              <input
                type="checkbox"
                checked={isCompleted}
                onChange={() => onToggleCompleted(course.id)}
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

function RemainingCourses({
  courses,
  assignments,
  onAssign,
  onClear,
}: {
  courses: PlannerCourse[];
  assignments: Partial<Record<string, Semester>>;
  onAssign: (courseId: string, semester: Semester) => void;
  onClear: (courseId: string) => void;
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
              key={course.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{course.code}</p>
                  <p className="text-sm text-slate-600">{course.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {course.units} units
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {semesters.map((semester) => (
                    <button
                      key={semester.key}
                      type="button"
                      onClick={() => onAssign(course.id, semester.key)}
                      className={`h-9 rounded-md border px-3 text-sm font-semibold transition ${
                        assignments[course.id] === semester.key
                          ? "border-teal-700 bg-teal-700 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-800"
                      }`}
                    >
                      {semester.label}
                    </button>
                  ))}
                  {assignments[course.id] ? (
                    <button
                      type="button"
                      onClick={() => onClear(course.id)}
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

function SemesterColumn({
  title,
  courses,
  units,
  onClear,
}: {
  title: string;
  courses: PlannerCourse[];
  units: number;
  onClear: (courseId: string) => void;
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
            <article key={course.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{course.code}</p>
                  <p className="text-sm text-slate-600">{course.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {course.units} units
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onClear(course.id)}
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

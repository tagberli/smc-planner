"use client";

import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { majors, targetLabel } from "@/lib/requirements";

export function HomePlanner() {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState(majors[0]?.slug ?? "");

  const targets = useMemo(
    () => majors.find((major) => major.slug === selectedSlug)?.targets ?? [],
    [selectedSlug],
  );

  const [selectedTarget, setSelectedTarget] = useState(
    targets[0] ? targetLabel(targets[0]) : "",
  );

  function handleMajorChange(slug: string) {
    const nextTargets = majors.find((major) => major.slug === slug)?.targets ?? [];

    setSelectedSlug(slug);
    setSelectedTarget(nextTargets[0] ? targetLabel(nextTargets[0]) : "");
  }

  function startPlanning() {
    const params = new URLSearchParams({ major: selectedSlug, school: selectedTarget });

    router.push(`/plan?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            Santa Monica College
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950 sm:text-5xl">
            SMC Ed Planner
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Build a quick transfer course plan from major and target school requirements.
          </p>
        </div>

        <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Major</span>
            <select
              value={selectedSlug}
              onChange={(event) => handleMajorChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              {majors.map((major) => (
                <option key={major.slug} value={major.slug}>
                  {major.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Target School</span>
            <select
              value={selectedTarget}
              onChange={(event) => setSelectedTarget(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              {targets.map((target) => (
                <option key={targetLabel(target)} value={targetLabel(target)}>
                  {targetLabel(target)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={startPlanning}
            disabled={!selectedSlug || !selectedTarget}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Start Planning
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </div>

        <p className="mt-6 max-w-2xl text-sm leading-6 text-slate-500">
          Requirement data is a work in progress and is not a substitute for advice from an SMC
          counselor. Confirm every plan against the official agreement on ASSIST before you
          enroll.
        </p>
      </section>
    </main>
  );
}

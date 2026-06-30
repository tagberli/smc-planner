"use client";

import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { requirements } from "@/lib/requirements";

export function HomePlanner() {
  const router = useRouter();
  const [selectedMajor, setSelectedMajor] = useState(requirements.majors[0]?.name ?? "");

  const targetSchools = useMemo(() => {
    return (
      requirements.majors.find((major) => major.name === selectedMajor)?.targetSchools ?? []
    );
  }, [selectedMajor]);

  const [selectedSchool, setSelectedSchool] = useState(targetSchools[0]?.school ?? "");

  function handleMajorChange(majorName: string) {
    const schoolsForMajor =
      requirements.majors.find((major) => major.name === majorName)?.targetSchools ?? [];

    setSelectedMajor(majorName);
    setSelectedSchool(schoolsForMajor[0]?.school ?? "");
  }

  function startPlanning() {
    const params = new URLSearchParams({
      major: selectedMajor,
      school: selectedSchool,
    });

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
              value={selectedMajor}
              onChange={(event) => handleMajorChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              {requirements.majors.map((major) => (
                <option key={major.name} value={major.name}>
                  {major.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Target School</span>
            <select
              value={selectedSchool}
              onChange={(event) => setSelectedSchool(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              {targetSchools.map((targetSchool) => (
                <option key={targetSchool.school} value={targetSchool.school}>
                  {targetSchool.school}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={startPlanning}
            disabled={!selectedMajor || !selectedSchool}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Start Planning
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </div>
      </section>
    </main>
  );
}

import { Suspense } from "react";
import { PlanClient } from "@/components/PlanClient";

export default function PlanPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10 text-slate-700">
          Loading plan...
        </main>
      }
    >
      <PlanClient />
    </Suspense>
  );
}

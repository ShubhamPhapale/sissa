import { Suspense } from "react";
import AnalysisClient from "./AnalysisClient";
import Header from "@/components/Header";

export default function AnalysisPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="text-6xl animate-pulse">♟</span>
              <p className="mt-4 text-[var(--text-secondary)]">Loading analysis board…</p>
            </div>
          </div>
        }
      >
        <AnalysisClient />
      </Suspense>
    </div>
  );
}

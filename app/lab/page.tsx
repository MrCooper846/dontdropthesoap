"use client";
import { useState } from "react";
import FoundationSpike from "@/components/FoundationSpike";
export default function Lab() {
  const [mounted, setMounted] = useState(true);
  return (
    <main className="screen stack">
      <h1>Foundation lab</h1>
      <p>Development prototypes, not completed yard or builder features.</p>
      <button className="button" onClick={() => setMounted((v) => !v)}>
        {mounted ? "Unmount prototypes" : "Mount prototypes"}
      </button>
      {mounted && <FoundationSpike />}
    </main>
  );
}

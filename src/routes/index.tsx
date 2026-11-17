import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PosApp } from "@/components/pos/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg px-6 text-center text-fg">
        <div>
          <p className="font-display text-3xl tracking-tight">BeerFlow POS</p>
          <p className="mt-2 text-muted">Opening restaurant till…</p>
        </div>
      </main>
    );
  }
  return <PosApp />;
}

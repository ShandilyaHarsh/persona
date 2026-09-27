"use client";

import dynamic from "next/dynamic";

// Everything this app holds lives in the browser - localStorage, the
// microphone, WebRTC - so there is nothing meaningful to render on the server.
const App = dynamic(() => import("@/components/shell/app"), { ssr: false });

export default function Home() {
  return (
    <main className="relative grid h-dvh grid-cols-1 bg-paper md:grid-cols-2">
      <App />
    </main>
  );
}

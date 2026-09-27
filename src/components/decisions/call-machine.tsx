import { ArrowRightIcon } from "@/components/icons";

import type { Branch, CallState } from "./content";

/**
 * The call as a state machine: four states left to right, each with every way
 * out of it. Endings (not states you stay in) are set apart in a lighter tone
 * so the eye follows the path a call actually travels.
 */
export function CallMachine({ states, after }: { states: CallState[]; after: Branch[] }) {
  const stateTitles = new Set(states.map((state) => state.title));
  return (
    <div className="flex flex-col gap-8">
      <ol className="grid gap-3 md:grid-cols-4">
        {states.map((state, index) => (
          <li key={state.id} className="relative flex flex-col gap-4 rounded-[20px] bg-well p-5">
            {index < states.length - 1 ? (
              <span
                aria-hidden
                className="absolute -right-3 top-8 z-10 hidden size-6 items-center justify-center rounded-full bg-paper text-ink-faint md:flex"
              >
                <ArrowRightIcon size={14} strokeWidth={2} />
              </span>
            ) : null}
            <div className="flex flex-col gap-1">
              <span className="text-title3 font-semibold text-ink">{state.title}</span>
              <span className="text-footnote text-ink-muted">{state.looks}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {state.exits.map((exit) => {
                const ending = !stateTitles.has(exit.to);
                return (
                  <li key={exit.on} className="flex flex-col gap-0.5 rounded-[12px] bg-white px-3 py-2.5 shadow-[0_0_0_1px_rgba(0,0,0,0.05)]">
                    <span className="text-footnote text-ink-muted">{exit.on}</span>
                    <span className={`text-subhead font-semibold ${ending ? "text-ink-muted" : "text-ink"}`}>→ {exit.to}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-4">
        <h4 className="text-subhead font-semibold text-ink">When a call ends</h4>
        <dl className="flex flex-col divide-y divide-black/[0.06] rounded-[20px] bg-well px-5">
          {after.map((branch) => (
            <div key={branch.if} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6">
              <dt className="text-subhead font-medium text-ink">{branch.if}</dt>
              <dd className="text-subhead text-ink-muted">{branch.then}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

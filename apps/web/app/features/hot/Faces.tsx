import type { HotParticipant } from "@aihot/contracts/site";
import { shortSourceName } from "../../lib/format";
import { SourceAvatar } from "../../components/ui/SourceAvatar";

/**
 * Who is talking about a hot story: overlapping faces of the 精选组 sources in the order the server
 * gives (T1, T1.5, T2), then a count for everyone else, 氛围组 included. Hover lists every name.
 */
export function Faces({ participants, total, size = 24, max = 6 }: { participants: HotParticipant[]; total: number; size?: number; max?: number }) {
  const shown = participants.filter((p) => p.kind === "editorial").slice(0, max);
  const rest = total - shown.length;
  return (
    <span className="relative z-10 flex shrink-0 items-center" title={participants.map((p) => shortSourceName(p.name)).join("、")}>
      {shown.map((p, i) => (
        <span key={p.name} className={`rounded-full ring-2 ring-surface ${i ? "-ml-1.5" : ""}`}>
          <SourceAvatar name={p.name} iconUrl={p.iconUrl} iconSrcSet={p.iconSrcSet} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-bg-sunk px-1.5 text-[10.5px] font-medium text-ink-3 ring-2 ring-surface dark:bg-bg-muted" style={{ height: size, minWidth: size }}>
          +{rest}
        </span>
      )}
    </span>
  );
}

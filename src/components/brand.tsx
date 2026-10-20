import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="HyperThread">
      <Image
        src="/hyperthread-mark.svg"
        alt=""
        width={compact ? 36 : 44}
        height={compact ? 36 : 44}
        priority
      />
      <span
        className={
          compact
            ? "text-lg font-semibold tracking-tight"
            : "text-2xl font-semibold tracking-tight"
        }
      >
        HyperThread
      </span>
    </div>
  );
}

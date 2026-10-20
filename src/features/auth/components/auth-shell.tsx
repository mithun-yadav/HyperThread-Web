import Link from "next/link";
import {
  CheckCircle2Icon,
  LockKeyholeIcon,
  MessagesSquareIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";

const promises = [
  { icon: LockKeyholeIcon, text: "Tokens stay in secure, HttpOnly cookies" },
  {
    icon: MessagesSquareIcon,
    text: "Realtime conversations without the noise",
  },
  { icon: CheckCircle2Icon, text: "Focused states that make progress clear" },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background grid min-h-dvh lg:grid-cols-[minmax(24rem,0.88fr)_minmax(34rem,1.12fr)]">
      <section className="bg-primary text-primary-foreground relative hidden min-h-dvh overflow-hidden p-12 lg:flex lg:flex-col xl:p-16">
        <div
          className="border-primary-foreground/12 absolute -top-24 -right-24 size-80 rounded-full border-[64px]"
          aria-hidden="true"
        />
        <div
          className="bg-accent/25 absolute bottom-28 -left-20 size-56 rounded-full"
          aria-hidden="true"
        />
        <Link href="/" className="relative z-10 w-fit">
          <Brand />
        </Link>

        <div className="relative z-10 my-auto max-w-lg py-16">
          <p className="text-primary-foreground/70 mb-5 text-sm font-semibold tracking-[0.18em] uppercase">
            Your shared conversation space
          </p>
          <p className="text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-balance xl:text-5xl">
            Keep every important thread in motion.
          </p>
          <p className="text-primary-foreground/74 mt-6 max-w-md text-lg leading-8">
            HyperThread brings direct and group conversations into one calm,
            secure workspace.
          </p>

          <ul className="mt-10 space-y-4" aria-label="Product benefits">
            {promises.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <span className="bg-primary-foreground/12 grid size-8 place-items-center rounded-lg">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-primary-foreground/62 relative z-10 text-xs">
          Built for focused teams and trusted conversations.
        </p>
      </section>

      <section className="relative flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <Link href="/" className="absolute top-6 left-5 sm:left-8 lg:hidden">
          <Brand compact />
        </Link>
        <div className="w-full max-w-[29rem] pt-16 lg:pt-0">{children}</div>
      </section>
    </main>
  );
}

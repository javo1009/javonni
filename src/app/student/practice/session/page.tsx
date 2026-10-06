import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PracticeSession, type SessionScope } from "@/components/student/practice-session";
import { buttonClass, EmptyState } from "@/components/ui";
import { getCurriculum, studentContext } from "@/server/context";

export const metadata: Metadata = { title: "Practice session" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SessionPage({ searchParams }: PageProps<"/student/practice/session">) {
  await studentContext();
  const c = await getCurriculum();
  const sp = await searchParams;
  const kind = one(sp.scope) ?? "mixed";
  const id = one(sp.id) ?? "";
  const rawCount = Number(one(sp.count));
  const count = Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 30 ? rawCount : 10;

  let scope: SessionScope | null = null;
  let title = "";
  let subtitle = "";
  let fallbackHref: string | null = null;
  if (kind === "mixed") {
    scope = { kind: "mixed" };
    title = "Smart mixed set";
    subtitle = "Reviews due, untouched objectives and weak spots, across the curriculum.";
  } else if (kind === "review") {
    scope = { kind: "review" };
    title = "Review set";
    subtitle = "Objectives that are due for review come first.";
  } else if (kind === "topic") {
    const t = c.topics.find((x) => x.id === id);
    if (t) {
      scope = { kind: "topic", id };
      title = t.name;
      subtitle = "Questions from across this topic.";
    }
  } else if (kind === "module") {
    const m = c.modules.find((x) => x.id === id);
    if (m) {
      scope = { kind: "module", id };
      title = m.title;
      subtitle = c.topics.find((t) => t.id === m.topicId)?.name ?? "";
      fallbackHref = `/student/practice/session?scope=topic&id=${m.topicId}&count=${count}`;
    }
  } else if (kind === "los") {
    const l = c.los.find((x) => x.id === id);
    if (l) {
      scope = { kind: "los", id };
      title = `${l.code} · ${l.text}`;
      subtitle = "Questions on this one objective.";
      fallbackHref = `/student/practice/session?scope=module&id=${l.moduleId}&count=${count}`;
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/student/practice" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline sm:min-h-0">
          <ChevronLeft className="size-4" aria-hidden /> Practice
        </Link>
        {scope && (
          <>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight tracking-tight text-ink sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
          </>
        )}
      </div>
      {scope ? (
        <PracticeSession key={`${kind}-${id}-${count}`} scope={scope} count={count} fallbackHref={fallbackHref} />
      ) : (
        <EmptyState
          title="That practice set doesn't exist"
          action={
            <Link href="/student/practice" className={buttonClass("primary")}>
              Choose a set
            </Link>
          }
        >
          The link may be out of date, for example after the curriculum was updated.
        </EmptyState>
      )}
    </div>
  );
}

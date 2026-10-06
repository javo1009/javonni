import type { Metadata } from "next";
import { OnboardingForm } from "@/components/student/onboarding-form";
import { Banner, PageHeader } from "@/components/ui";
import { studentContext } from "@/server/context";
import { listClasses } from "@/services/classes";
import { getActivePlan } from "@/services/plan";

export const metadata: Metadata = { title: "Set up your plan" };

const STEADY = [60, 60, 60, 60, 60, 150, 150];

export default async function OnboardingPage() {
  const { user, actor, db, today } = await studentContext();
  const active = await getActivePlan(db, actor.id);
  const classes = active ? [] : await listClasses(db, actor);
  const classExam = classes.map((c) => c.examDate).find((d): d is string => !!d && d > today);

  const initial = active
    ? {
        examDate: active.plan.examDate > today ? active.plan.examDate : "",
        weeklyMinutes: active.plan.weeklyMinutes,
        blackoutDates: active.plan.blackoutDates.filter((d) => d >= today),
      }
    : { examDate: classExam ?? "", weeklyMinutes: STEADY, blackoutDates: [] };

  return (
    <div className="max-w-3xl">
      <OnboardingForm
        today={today}
        initial={initial}
        rebuilding={!!active}
        intro={
          <>
            <PageHeader
              eyebrow={active ? "Plan settings" : `Welcome, ${user.name.split(" ")[0]}`}
              title={active ? "Rebuild your plan" : "Let's build your study plan"}
              description={
                active
                  ? "Change your exam date or weekly time. The new plan starts today and keeps everything you've already finished."
                  : "Three quick questions. Ascent schedules every module, practice, review and mock exams around the time you have."
              }
            />
            {active && (
              <div className="mb-6">
                <Banner tone="neutral" title="Your current plan will be replaced">
                  Completed reading and practice history stay. Upcoming tasks are rescheduled from today.
                </Banner>
              </div>
            )}
            {!active && classExam && (
              <p className="mb-4 text-sm text-ink-2">We filled in your class&apos;s exam date. Change it if yours is different.</p>
            )}
          </>
        }
      />
    </div>
  );
}

import { ButtonLink, EmptyState } from "@/components/ui";

export default function TeacherNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        title="We couldn't find that"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href="/teacher">Class overview</ButtonLink>
            <ButtonLink href="/teacher/classes" variant="secondary">
              All classes
            </ButtonLink>
          </div>
        }
      >
        The class or student may have been removed, or it belongs to another
        teacher.
      </EmptyState>
    </div>
  );
}

import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="pt-10">
      <EmptyState
        title="We couldn't find that homework"
        action={
          <ButtonLink href="/student/homework">Back to homework</ButtonLink>
        }
      >
        It may have been withdrawn, or it isn&apos;t set for you.
      </EmptyState>
    </div>
  );
}

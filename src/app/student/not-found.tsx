import { ButtonLink, EmptyState } from "@/components/ui";

export default function StudentNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        title="We couldn't find that page"
        action={<ButtonLink href="/student">Back to overview</ButtonLink>}
      >
        The link may be out of date, or the item may have been removed.
      </EmptyState>
    </div>
  );
}

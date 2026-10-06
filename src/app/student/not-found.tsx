import { ButtonLink, EmptyState } from "@/components/ui";

export default function StudentNotFound() {
  return (
    <EmptyState title="We couldn't find that" action={<ButtonLink href="/student">Back to today</ButtonLink>}>
      The link may be out of date, or the item isn&apos;t shared with you.
    </EmptyState>
  );
}

import { PageHeader } from "@/components/ui";
import { studentContext } from "@/server/context";
export default async function StudentHome() {
  const { user } = await studentContext();
  return <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} description="Placeholder — the student team is building this page." />;
}

import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { HelpCenter } from "./help-center";

export default async function HelpPage() {
  await requireAuth();
  return (
    <div>
      <PageHeader
        title="Help Center"
        subtitle="Answers to common questions, and a guided tour of the platform."
      />
      <HelpCenter />
    </div>
  );
}

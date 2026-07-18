import { PageHeader } from "@/components/PageHeader";
import { TrainingWizard } from "@/components/TrainingWizard";

export default function NewTraining() {
  return (
    <>
      <PageHeader title="Curate a training"
        sub="The type determines everything else — settings, delivery, and what participants see." />
      <TrainingWizard />
    </>
  );
}

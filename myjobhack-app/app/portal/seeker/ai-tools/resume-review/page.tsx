import { PageHeader } from "@/components/PageHeader";
import { ToolAllowance } from "@/components/ToolAllowance";
import { AiToolRunner } from "@/components/AiToolRunner";

export default function ResumeReviewPage() {
  return (
    <>
      <PageHeader
        title="Resume Review"
        sub="Runs on the resume in your profile. Honest diagnosis only — every loophole an employer would spot, none of the sugar."
      />
      <ToolAllowance slug="resume-review" />
      <AiToolRunner endpoint="/api/ai/resume-review" runLabel="Review my resume →" />
    </>
  );
}

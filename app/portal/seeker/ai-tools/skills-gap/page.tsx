import { PageHeader } from "@/components/PageHeader";
import { AiToolRunner } from "@/components/AiToolRunner";

export default function SkillsGapPage() {
  return (
    <>
      <PageHeader
        title="Skills Gap Analysis"
        sub="Your profile and resume versus current market demand in your niche — what you have, what's missing, and the order to learn it in."
      />
      <AiToolRunner endpoint="/api/ai/skills-gap" runLabel="Analyse my gaps →" />
    </>
  );
}

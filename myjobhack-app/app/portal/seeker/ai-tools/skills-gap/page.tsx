import { PageHeader } from "@/components/PageHeader";
import { ToolAllowance } from "@/components/ToolAllowance";
import { AiToolRunner } from "@/components/AiToolRunner";

export default function SkillsGapPage() {
  return (
    <>
      <PageHeader
        title="Skills Gap Analysis"
        sub="Your profile and resume versus current market demand in your niche — what you have, what's missing, and the order to learn it in."
      />
      <ToolAllowance slug="skills-gap" />
      <AiToolRunner endpoint="/api/ai/skills-gap" runLabel="Analyse my gaps →" />
    </>
  );
}

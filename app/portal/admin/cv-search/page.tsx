import { PageHeader } from "@/components/PageHeader";
import { ResumeSearch } from "@/components/ResumeSearch";

export const dynamic = "force-dynamic";

/**
 * Find talent by what their CV says, not by what a form asked them.
 *
 * Every structured filter in the CRM can only answer questions somebody
 * thought to ask at signup. This page answers the ones nobody anticipated —
 * a language, a licence, a piece of software, a former employer.
 */
export default function CvSearchPage() {
  return (
    <>
      <PageHeader
        title="Search CVs"
        sub="Search the full text of every CV in the pool — languages, tools, licences and anything else that was never a form field." />
      <ResumeSearch />
    </>
  );
}

import { PageHeader } from "@/components/PageHeader";
import { StaffManager } from "@/components/StaffManager";

export const dynamic = "force-dynamic";

/**
 * Create team members and decide what each of them can reach.
 *
 * Separate from /portal/admin/users, which lists every account on the platform
 * including seekers. This page is only about staff — the people with access to
 * the back office — because that is the list you actually need to audit.
 */
export default function StaffPage() {
  return (
    <>
      <PageHeader
        title="Team & access"
        sub="Invite people and choose what each of them can do. Role decides which portal they see; access level decides what they can reach inside it." />
      <StaffManager />
    </>
  );
}

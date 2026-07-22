import { InvitationAcceptance } from "@/components/auth/InvitationAcceptance";

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <InvitationAcceptance token={token} />;
}

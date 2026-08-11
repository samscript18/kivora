import { InvitationAcceptance } from "@/components/auth/InvitationAcceptance";
import { Providers } from "@/components/Providers";

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <Providers><InvitationAcceptance token={token} /></Providers>;
}

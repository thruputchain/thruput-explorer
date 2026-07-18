import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContractPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  redirect(`/address/${address}`);
}

import ClientDetailView from "@/components/ClientDetailView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client | CRM PPA",
};

type ClientPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClientPage({ params }: ClientPageProps) {
  const { id } = await params;

  return <ClientDetailView clientId={id} />;
}

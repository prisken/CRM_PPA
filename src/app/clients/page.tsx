import ClientsPageContent from "@/components/ClientsPageContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clients | CRM PPA",
};

export default function ClientsPage() {
  return <ClientsPageContent />;
}

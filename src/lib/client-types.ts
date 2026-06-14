export type ClientSpecialist = {
  id: string;
  name: string | null;
  role: string;
  label: string;
};

export type ClientInteraction = {
  id: string;
  type: string;
  title: string | null;
  notes: string | null;
  occurredAt: string;
  user: {
    id: string;
    name: string | null;
  };
};

export type ClientDeal = {
  id: string;
  title: string;
  description: string | null;
  value: string | null;
  status: string;
  createdAt: string;
};

export type ClientNote = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  lastModified: string;
};

export type ClientDetail = {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  pendingNotifications: boolean;
  specialists: ClientSpecialist[];
  interactions: ClientInteraction[];
  deals: ClientDeal[];
  notes: ClientNote[];
};

export function getClientDisplayName(
  client: Pick<ClientDetail, "firstName" | "lastName">,
) {
  return `${client.firstName} ${client.lastName}`.trim();
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getInteractionText(interaction: ClientInteraction) {
  return interaction.notes || interaction.title || "No details provided.";
}

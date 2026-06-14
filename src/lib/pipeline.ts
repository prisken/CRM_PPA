export const CLIENT_STATUSES = {
  NEW_LEAD: "NEW_LEAD",
  NURTURING: "NURTURING",
  STRATEGY_SESSION: "STRATEGY_SESSION",
  ACTIVE: "ACTIVE",
} as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[keyof typeof CLIENT_STATUSES];

export const PIPELINE_COLUMNS = [
  { id: CLIENT_STATUSES.NEW_LEAD, title: "New Lead" },
  { id: CLIENT_STATUSES.NURTURING, title: "Nurturing" },
  { id: CLIENT_STATUSES.STRATEGY_SESSION, title: "Strategy Session" },
  { id: CLIENT_STATUSES.ACTIVE, title: "Active" },
] as const;

export type PipelineColumnId = (typeof PIPELINE_COLUMNS)[number]["id"];

export type ClientCard = {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  status: ClientStatus;
  pendingNotifications: boolean;
};

export function getClientName(client: Pick<ClientCard, "firstName" | "lastName">) {
  return `${client.firstName} ${client.lastName}`.trim();
}

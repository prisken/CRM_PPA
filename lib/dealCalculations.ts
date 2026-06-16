import { DealStatus } from '@prisma/client';

type DealValueInput = {
  dealValue: { toString(): string } | number;
  status: DealStatus | string;
};

type DealTotalCommissionInput = DealValueInput & {
  totalCommission: { toString(): string } | number;
};

export function calculateCommittedValue(deals: DealValueInput[]) {
  return deals
    .filter((deal) => deal.status === DealStatus.WON)
    .reduce((total, deal) => total + Number(deal.dealValue), 0);
}

export function calculatePotentialValue(deals: DealValueInput[]) {
  return deals
    .filter((deal) => deal.status === DealStatus.PROPOSED)
    .reduce((total, deal) => total + Number(deal.dealValue), 0);
}

export function calculateWonTotalCommission(deals: DealTotalCommissionInput[]) {
  return deals
    .filter((deal) => deal.status === DealStatus.WON)
    .reduce((total, deal) => total + Number(deal.totalCommission), 0);
}

export function formatDealResponse(deal: {
  id: string;
  name: string;
  dealValue: { toString(): string };
  totalCommission: { toString(): string };
  status: DealStatus;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: deal.id,
    name: deal.name,
    dealValue: Number(deal.dealValue),
    totalCommission: Number(deal.totalCommission),
    status: deal.status,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}

export function parseMoneyValue(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    return { error: `${fieldName} is required` };
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || numericValue < 0) {
    return { error: `${fieldName} must be a non-negative number` };
  }

  return { value: numericValue };
}

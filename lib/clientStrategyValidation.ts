import {
  StrategyConnectionType,
  StrategyExpenseCategory,
  StrategyExpenseFrequency,
  StrategyExpensePriority,
  StrategyIncomeFrequency,
  StrategyPlanStatus,
  StrategyProjectionMilestoneType,
  StrategyStepType,
} from '@prisma/client';

export type ValidationSuccess<T> = { ok: true; data: T };
export type ValidationFailure = { ok: false; error: string };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export type StrategySchema<T> = {
  parse: (input: unknown) => ValidationResult<T>;
};

export type CreateStrategyPlanInput = {
  title: string;
  description?: string | null;
  clientGoal?: string | null;
  expectedOutcome?: string | null;
  status?: StrategyPlanStatus;
};

export type UpdateStrategyPlanInput = {
  title?: string;
  description?: string | null;
  clientGoal?: string | null;
  expectedOutcome?: string | null;
  status?: StrategyPlanStatus;
};

export type CreateStrategyStepInput = {
  title: string;
  linkedDealId?: string | null;
  stepType?: StrategyStepType;
  plannedAmount?: number | null;
  amountDescription?: string | null;
  purpose?: string | null;
  expectedAchievement?: string | null;
  expectedIncomeAmount?: number | null;
  expectedIncomeFrequency?: StrategyIncomeFrequency | null;
  timelineLabel?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  investmentAmount?: number | null;
  incomeAmount?: number | null;
  incomeFrequency?: StrategyIncomeFrequency | null;
  incomeStartYear?: number | null;
  incomeEndYear?: number | null;
  capitalReturned?: number | null;
  capitalReturnYear?: number | null;
  sortOrder?: number;
};

export type UpdateStrategyStepInput = {
  title?: string;
  linkedDealId?: string | null;
  stepType?: StrategyStepType;
  plannedAmount?: number | null;
  amountDescription?: string | null;
  purpose?: string | null;
  expectedAchievement?: string | null;
  expectedIncomeAmount?: number | null;
  expectedIncomeFrequency?: StrategyIncomeFrequency | null;
  timelineLabel?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  investmentAmount?: number | null;
  incomeAmount?: number | null;
  incomeFrequency?: StrategyIncomeFrequency | null;
  incomeStartYear?: number | null;
  incomeEndYear?: number | null;
  capitalReturned?: number | null;
  capitalReturnYear?: number | null;
  sortOrder?: number;
};

export type CreateStrategyConnectionInput = {
  fromStepId: string;
  toStepId: string;
  connectionType?: StrategyConnectionType;
  purpose?: string | null;
  expectedOutcome?: string | null;
  timing?: string | null;
};

export type UpdateStrategyConnectionInput = {
  fromStepId?: string;
  toStepId?: string;
  connectionType?: StrategyConnectionType;
  purpose?: string | null;
  expectedOutcome?: string | null;
  timing?: string | null;
};

export type CreateStrategyExpenseInput = {
  title: string;
  category?: StrategyExpenseCategory;
  amount?: number | null;
  frequency?: StrategyExpenseFrequency;
  startTimelineLabel?: string | null;
  endTimelineLabel?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  priority?: StrategyExpensePriority;
  purpose?: string | null;
  coveredByStepId?: string | null;
  notes?: string | null;
  sortOrder?: number;
};

export type UpdateStrategyExpenseInput = {
  title?: string;
  category?: StrategyExpenseCategory;
  amount?: number | null;
  frequency?: StrategyExpenseFrequency;
  startTimelineLabel?: string | null;
  endTimelineLabel?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  priority?: StrategyExpensePriority;
  purpose?: string | null;
  coveredByStepId?: string | null;
  notes?: string | null;
  sortOrder?: number;
};

export type CreateStrategyProjectionMilestoneInput = {
  year: number;
  title: string;
  type: StrategyProjectionMilestoneType;
  stepId?: string | null;
  monthlyIncome?: number | null;
  monthsOfIncome?: number | null;
  annualIncome?: number | null;
  capitalInvested?: number | null;
  capitalRemaining?: number | null;
  incomeThisPeriod?: number | null;
  cumulativeIncome?: number | null;
  totalAssetPosition?: number | null;
  expensesThisYear?: number | null;
  cumulativeExpenses?: number | null;
  netCashflowThisYear?: number | null;
  capitalReturnedThisYear?: number | null;
  capitalReturnedToDate?: number | null;
  /** Replace milestone→step contribution links. Omitted on update = preserve. */
  selectedStepIds?: string[];
  /** Replace milestone→expense contribution links. Omitted on update = preserve. */
  selectedExpenseIds?: string[];
  notes?: string | null;
  sortOrder?: number;
};

export type UpdateStrategyProjectionMilestoneInput = {
  year?: number;
  title?: string;
  type?: StrategyProjectionMilestoneType;
  stepId?: string | null;
  monthlyIncome?: number | null;
  monthsOfIncome?: number | null;
  annualIncome?: number | null;
  capitalInvested?: number | null;
  capitalRemaining?: number | null;
  incomeThisPeriod?: number | null;
  cumulativeIncome?: number | null;
  totalAssetPosition?: number | null;
  expensesThisYear?: number | null;
  cumulativeExpenses?: number | null;
  netCashflowThisYear?: number | null;
  capitalReturnedThisYear?: number | null;
  capitalReturnedToDate?: number | null;
  selectedStepIds?: string[];
  selectedExpenseIds?: string[];
  notes?: string | null;
  sortOrder?: number;
};

/** Inclusive calendar-year bounds for projection milestones. */
export const STRATEGY_PROJECTION_YEAR_MIN = 1900;
export const STRATEGY_PROJECTION_YEAR_MAX = 2200;

function fail(error: string): ValidationFailure {
  return { ok: false, error };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequiredString(
  value: unknown,
  fieldName: string
): ValidationResult<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return fail(`${fieldName} is required`);
  }

  return { ok: true, data: value.trim() };
}

function parseOptionalString(
  value: unknown,
  fieldName: string
): ValidationResult<string | null | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value === null) {
    return { ok: true, data: null };
  }

  if (typeof value !== 'string') {
    return fail(`${fieldName} must be a string or null`);
  }

  const trimmed = value.trim();
  return { ok: true, data: trimmed.length > 0 ? trimmed : null };
}

function parseOptionalId(
  value: unknown,
  fieldName: string
): ValidationResult<string | null | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value === null || value === '') {
    return { ok: true, data: null };
  }

  if (typeof value !== 'string' || !value.trim()) {
    return fail(`${fieldName} must be a non-empty string or null`);
  }

  return { ok: true, data: value.trim() };
}

function parseOptionalEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[]
): ValidationResult<T | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, data: undefined };
  }

  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return fail(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }

  return { ok: true, data: value as T };
}

function parseOptionalNullableEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[]
): ValidationResult<T | null | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value === null || value === '') {
    return { ok: true, data: null };
  }

  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return fail(`${fieldName} must be one of: ${allowed.join(', ')}, or null`);
  }

  return { ok: true, data: value as T };
}

function parseOptionalMoney(
  value: unknown,
  fieldName: string
): ValidationResult<number | null | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value === null || value === '') {
    return { ok: true, data: null };
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fail(`${fieldName} must be a non-negative number`);
  }

  return { ok: true, data: numericValue };
}

/** Optional money that may be negative (e.g. net cashflow). */
function parseOptionalSignedMoney(
  value: unknown,
  fieldName: string
): ValidationResult<number | null | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value === null || value === '') {
    return { ok: true, data: null };
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fail(`${fieldName} must be a finite number`);
  }

  return { ok: true, data: numericValue };
}

function parseOptionalSortOrder(
  value: unknown,
  fieldName: string
): ValidationResult<number | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, data: undefined };
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || !Number.isInteger(numericValue)) {
    return fail(`${fieldName} must be an integer`);
  }

  return { ok: true, data: numericValue };
}

function parseRequiredYear(
  value: unknown,
  fieldName: string
): ValidationResult<number> {
  if (value === undefined || value === null || value === '') {
    return fail(`${fieldName} is required`);
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || !Number.isInteger(numericValue)) {
    return fail(`${fieldName} must be an integer`);
  }

  if (
    numericValue < STRATEGY_PROJECTION_YEAR_MIN ||
    numericValue > STRATEGY_PROJECTION_YEAR_MAX
  ) {
    return fail(
      `${fieldName} must be between ${STRATEGY_PROJECTION_YEAR_MIN} and ${STRATEGY_PROJECTION_YEAR_MAX}`
    );
  }

  return { ok: true, data: numericValue };
}

function parseOptionalYear(
  value: unknown,
  fieldName: string
): ValidationResult<number | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  return parseRequiredYear(value, fieldName);
}

/** Optional calendar year that may be cleared with null. */
function parseOptionalNullableYear(
  value: unknown,
  fieldName: string
): ValidationResult<number | null | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value === null || value === '') {
    return { ok: true, data: null };
  }

  const parsed = parseRequiredYear(value, fieldName);
  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, data: parsed.data };
}

/**
 * Optional id list. Accepts primary key or alias (e.g. selectedStepIds / sourceStepIds).
 * undefined = omitted; null or [] = clear; non-empty array = replace set.
 */
function parseOptionalIdList(
  input: Record<string, unknown>,
  primaryKey: string,
  aliasKey: string
): ValidationResult<string[] | undefined> {
  const hasPrimary = Object.prototype.hasOwnProperty.call(input, primaryKey);
  const hasAlias = Object.prototype.hasOwnProperty.call(input, aliasKey);

  if (!hasPrimary && !hasAlias) {
    return { ok: true, data: undefined };
  }

  const primaryValue = hasPrimary ? input[primaryKey] : undefined;
  const aliasValue = hasAlias ? input[aliasKey] : undefined;

  if (hasPrimary && hasAlias) {
    const primaryList = normalizeIdListValue(primaryValue, primaryKey);
    if (!primaryList.ok) return primaryList;
    const aliasList = normalizeIdListValue(aliasValue, aliasKey);
    if (!aliasList.ok) return aliasList;

    const a = primaryList.data ?? [];
    const b = aliasList.data ?? [];
    if (a.length !== b.length || a.some((id, index) => id !== b[index])) {
      return fail(`${primaryKey} and ${aliasKey} must match when both are provided`);
    }

    return { ok: true, data: a };
  }

  return normalizeIdListValue(
    hasPrimary ? primaryValue : aliasValue,
    hasPrimary ? primaryKey : aliasKey
  );
}

function normalizeIdListValue(
  value: unknown,
  fieldName: string
): ValidationResult<string[] | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value === null) {
    return { ok: true, data: [] };
  }

  if (!Array.isArray(value)) {
    return fail(`${fieldName} must be an array of ids`);
  }

  const ids: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const entry = value[index];
    if (typeof entry !== 'string' || !entry.trim()) {
      return fail(`${fieldName}[${index}] must be a non-empty string`);
    }
    ids.push(entry.trim());
  }

  if (new Set(ids).size !== ids.length) {
    return fail(`${fieldName} must not contain duplicates`);
  }

  return { ok: true, data: ids };
}

function parseOptionalNonNegativeInt(
  value: unknown,
  fieldName: string
): ValidationResult<number | null | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value === null || value === '') {
    return { ok: true, data: null };
  }

  const numericValue = Number(value);
  if (
    !Number.isFinite(numericValue) ||
    !Number.isInteger(numericValue) ||
    numericValue < 0
  ) {
    return fail(`${fieldName} must be a non-negative integer`);
  }

  return { ok: true, data: numericValue };
}

function parseRequiredEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[]
): ValidationResult<T> {
  if (value === undefined || value === null || value === '') {
    return fail(`${fieldName} is required`);
  }

  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return fail(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }

  return { ok: true, data: value as T };
}

function assignIfDefined<T extends Record<string, unknown>, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
) {
  if (value !== undefined) {
    target[key] = value;
  }
}

const PLAN_STATUSES = Object.values(StrategyPlanStatus);
const STEP_TYPES = Object.values(StrategyStepType);
const CONNECTION_TYPES = Object.values(StrategyConnectionType);
const INCOME_FREQUENCIES = Object.values(StrategyIncomeFrequency);
const EXPENSE_FREQUENCIES = Object.values(StrategyExpenseFrequency);
const EXPENSE_CATEGORIES = Object.values(StrategyExpenseCategory);
const EXPENSE_PRIORITIES = Object.values(StrategyExpensePriority);
const PROJECTION_MILESTONE_TYPES: StrategyProjectionMilestoneType[] = [
  'INITIAL_INVESTMENT',
  'INCOME_CHECKPOINT',
  'EXIT_SCENARIO',
  'MATURITY_SCENARIO',
  'CUSTOM',
];

export const createStrategyPlanSchema: StrategySchema<CreateStrategyPlanInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      const title = parseRequiredString(input.title, 'title');
      if (!title.ok) return title;

      const description = parseOptionalString(input.description, 'description');
      if (!description.ok) return description;

      const clientGoal = parseOptionalString(input.clientGoal, 'clientGoal');
      if (!clientGoal.ok) return clientGoal;

      const expectedOutcome = parseOptionalString(
        input.expectedOutcome,
        'expectedOutcome'
      );
      if (!expectedOutcome.ok) return expectedOutcome;

      const status = parseOptionalEnum(
        input.status,
        'status',
        PLAN_STATUSES
      );
      if (!status.ok) return status;

      const data: CreateStrategyPlanInput = { title: title.data };
      assignIfDefined(data, 'description', description.data);
      assignIfDefined(data, 'clientGoal', clientGoal.data);
      assignIfDefined(data, 'expectedOutcome', expectedOutcome.data);
      assignIfDefined(data, 'status', status.data);

      return { ok: true, data };
    },
  };

export const updateStrategyPlanSchema: StrategySchema<UpdateStrategyPlanInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      const data: UpdateStrategyPlanInput = {};

      if (input.title !== undefined) {
        const title = parseRequiredString(input.title, 'title');
        if (!title.ok) return title;
        data.title = title.data;
      }

      const description = parseOptionalString(input.description, 'description');
      if (!description.ok) return description;
      assignIfDefined(data, 'description', description.data);

      const clientGoal = parseOptionalString(input.clientGoal, 'clientGoal');
      if (!clientGoal.ok) return clientGoal;
      assignIfDefined(data, 'clientGoal', clientGoal.data);

      const expectedOutcome = parseOptionalString(
        input.expectedOutcome,
        'expectedOutcome'
      );
      if (!expectedOutcome.ok) return expectedOutcome;
      assignIfDefined(data, 'expectedOutcome', expectedOutcome.data);

      const status = parseOptionalEnum(
        input.status,
        'status',
        PLAN_STATUSES
      );
      if (!status.ok) return status;
      assignIfDefined(data, 'status', status.data);

      if (Object.keys(data).length === 0) {
        return fail('At least one field is required to update');
      }

      return { ok: true, data };
    },
  };

function parseStrategyStepFields(
  input: Record<string, unknown>,
  options: { requireTitle: boolean }
): ValidationResult<CreateStrategyStepInput | UpdateStrategyStepInput> {
  const data: UpdateStrategyStepInput = {};

  if (options.requireTitle || input.title !== undefined) {
    const title = parseRequiredString(input.title, 'title');
    if (!title.ok) return title;
    data.title = title.data;
  }

  const linkedDealId = parseOptionalId(input.linkedDealId, 'linkedDealId');
  if (!linkedDealId.ok) return linkedDealId;
  assignIfDefined(data, 'linkedDealId', linkedDealId.data);

  const stepType = parseOptionalEnum(input.stepType, 'stepType', STEP_TYPES);
  if (!stepType.ok) return stepType;
  assignIfDefined(data, 'stepType', stepType.data);

  const plannedAmount = parseOptionalMoney(input.plannedAmount, 'plannedAmount');
  if (!plannedAmount.ok) return plannedAmount;
  assignIfDefined(data, 'plannedAmount', plannedAmount.data);

  const amountDescription = parseOptionalString(
    input.amountDescription,
    'amountDescription'
  );
  if (!amountDescription.ok) return amountDescription;
  assignIfDefined(data, 'amountDescription', amountDescription.data);

  const purpose = parseOptionalString(input.purpose, 'purpose');
  if (!purpose.ok) return purpose;
  assignIfDefined(data, 'purpose', purpose.data);

  const expectedAchievement = parseOptionalString(
    input.expectedAchievement,
    'expectedAchievement'
  );
  if (!expectedAchievement.ok) return expectedAchievement;
  assignIfDefined(data, 'expectedAchievement', expectedAchievement.data);

  const expectedIncomeAmount = parseOptionalMoney(
    input.expectedIncomeAmount,
    'expectedIncomeAmount'
  );
  if (!expectedIncomeAmount.ok) return expectedIncomeAmount;
  assignIfDefined(data, 'expectedIncomeAmount', expectedIncomeAmount.data);

  const expectedIncomeFrequency = parseOptionalNullableEnum(
    input.expectedIncomeFrequency,
    'expectedIncomeFrequency',
    INCOME_FREQUENCIES
  );
  if (!expectedIncomeFrequency.ok) return expectedIncomeFrequency;
  assignIfDefined(data, 'expectedIncomeFrequency', expectedIncomeFrequency.data);

  const timelineLabel = parseOptionalString(input.timelineLabel, 'timelineLabel');
  if (!timelineLabel.ok) return timelineLabel;
  assignIfDefined(data, 'timelineLabel', timelineLabel.data);

  const startYear = parseOptionalNullableYear(input.startYear, 'startYear');
  if (!startYear.ok) return startYear;
  assignIfDefined(data, 'startYear', startYear.data);

  const endYear = parseOptionalNullableYear(input.endYear, 'endYear');
  if (!endYear.ok) return endYear;
  assignIfDefined(data, 'endYear', endYear.data);

  const investmentAmount = parseOptionalMoney(
    input.investmentAmount,
    'investmentAmount'
  );
  if (!investmentAmount.ok) return investmentAmount;
  assignIfDefined(data, 'investmentAmount', investmentAmount.data);

  const incomeAmount = parseOptionalMoney(input.incomeAmount, 'incomeAmount');
  if (!incomeAmount.ok) return incomeAmount;
  assignIfDefined(data, 'incomeAmount', incomeAmount.data);

  const incomeFrequency = parseOptionalNullableEnum(
    input.incomeFrequency,
    'incomeFrequency',
    INCOME_FREQUENCIES
  );
  if (!incomeFrequency.ok) return incomeFrequency;
  assignIfDefined(data, 'incomeFrequency', incomeFrequency.data);

  const incomeStartYear = parseOptionalNullableYear(
    input.incomeStartYear,
    'incomeStartYear'
  );
  if (!incomeStartYear.ok) return incomeStartYear;
  assignIfDefined(data, 'incomeStartYear', incomeStartYear.data);

  const incomeEndYear = parseOptionalNullableYear(
    input.incomeEndYear,
    'incomeEndYear'
  );
  if (!incomeEndYear.ok) return incomeEndYear;
  assignIfDefined(data, 'incomeEndYear', incomeEndYear.data);

  const capitalReturned = parseOptionalMoney(
    input.capitalReturned,
    'capitalReturned'
  );
  if (!capitalReturned.ok) return capitalReturned;
  assignIfDefined(data, 'capitalReturned', capitalReturned.data);

  const capitalReturnYear = parseOptionalNullableYear(
    input.capitalReturnYear,
    'capitalReturnYear'
  );
  if (!capitalReturnYear.ok) return capitalReturnYear;
  assignIfDefined(data, 'capitalReturnYear', capitalReturnYear.data);

  const sortOrder = parseOptionalSortOrder(input.sortOrder, 'sortOrder');
  if (!sortOrder.ok) return sortOrder;
  assignIfDefined(data, 'sortOrder', sortOrder.data);

  return { ok: true, data };
}

export const createStrategyStepSchema: StrategySchema<CreateStrategyStepInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      return parseStrategyStepFields(input, {
        requireTitle: true,
      }) as ValidationResult<CreateStrategyStepInput>;
    },
  };

export const updateStrategyStepSchema: StrategySchema<UpdateStrategyStepInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      const result = parseStrategyStepFields(input, { requireTitle: false });
      if (!result.ok) return result;

      if (Object.keys(result.data).length === 0) {
        return fail('At least one field is required to update');
      }

      return result as ValidationResult<UpdateStrategyStepInput>;
    },
  };

function parseStrategyConnectionFields(
  input: Record<string, unknown>,
  options: { requireStepIds: boolean }
): ValidationResult<
  CreateStrategyConnectionInput | UpdateStrategyConnectionInput
> {
  const data: UpdateStrategyConnectionInput = {};

  if (options.requireStepIds || input.fromStepId !== undefined) {
    const fromStepId = parseRequiredString(input.fromStepId, 'fromStepId');
    if (!fromStepId.ok) return fromStepId;
    data.fromStepId = fromStepId.data;
  }

  if (options.requireStepIds || input.toStepId !== undefined) {
    const toStepId = parseRequiredString(input.toStepId, 'toStepId');
    if (!toStepId.ok) return toStepId;
    data.toStepId = toStepId.data;
  }

  if (
    data.fromStepId !== undefined &&
    data.toStepId !== undefined &&
    data.fromStepId === data.toStepId
  ) {
    return fail('fromStepId cannot equal toStepId');
  }

  const connectionType = parseOptionalEnum(
    input.connectionType,
    'connectionType',
    CONNECTION_TYPES
  );
  if (!connectionType.ok) return connectionType;
  assignIfDefined(data, 'connectionType', connectionType.data);

  const purpose = parseOptionalString(input.purpose, 'purpose');
  if (!purpose.ok) return purpose;
  assignIfDefined(data, 'purpose', purpose.data);

  const expectedOutcome = parseOptionalString(
    input.expectedOutcome,
    'expectedOutcome'
  );
  if (!expectedOutcome.ok) return expectedOutcome;
  assignIfDefined(data, 'expectedOutcome', expectedOutcome.data);

  const timing = parseOptionalString(input.timing, 'timing');
  if (!timing.ok) return timing;
  assignIfDefined(data, 'timing', timing.data);

  return { ok: true, data };
}

export const createStrategyConnectionSchema: StrategySchema<CreateStrategyConnectionInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      return parseStrategyConnectionFields(input, {
        requireStepIds: true,
      }) as ValidationResult<CreateStrategyConnectionInput>;
    },
  };

export const updateStrategyConnectionSchema: StrategySchema<UpdateStrategyConnectionInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      const result = parseStrategyConnectionFields(input, {
        requireStepIds: false,
      });
      if (!result.ok) return result;

      if (Object.keys(result.data).length === 0) {
        return fail('At least one field is required to update');
      }

      return result as ValidationResult<UpdateStrategyConnectionInput>;
    },
  };

function parseStrategyExpenseFields(
  input: Record<string, unknown>,
  options: { requireTitle: boolean }
): ValidationResult<CreateStrategyExpenseInput | UpdateStrategyExpenseInput> {
  const data: UpdateStrategyExpenseInput = {};

  if (options.requireTitle || input.title !== undefined) {
    const title = parseRequiredString(input.title, 'title');
    if (!title.ok) return title;
    data.title = title.data;
  }

  const category = parseOptionalEnum(
    input.category,
    'category',
    EXPENSE_CATEGORIES
  );
  if (!category.ok) return category;
  assignIfDefined(data, 'category', category.data);

  const amount = parseOptionalMoney(input.amount, 'amount');
  if (!amount.ok) return amount;
  assignIfDefined(data, 'amount', amount.data);

  const frequency = parseOptionalEnum(
    input.frequency,
    'frequency',
    EXPENSE_FREQUENCIES
  );
  if (!frequency.ok) return frequency;
  assignIfDefined(data, 'frequency', frequency.data);

  const startTimelineLabel = parseOptionalString(
    input.startTimelineLabel,
    'startTimelineLabel'
  );
  if (!startTimelineLabel.ok) return startTimelineLabel;
  assignIfDefined(data, 'startTimelineLabel', startTimelineLabel.data);

  const endTimelineLabel = parseOptionalString(
    input.endTimelineLabel,
    'endTimelineLabel'
  );
  if (!endTimelineLabel.ok) return endTimelineLabel;
  assignIfDefined(data, 'endTimelineLabel', endTimelineLabel.data);

  const startYear = parseOptionalNullableYear(input.startYear, 'startYear');
  if (!startYear.ok) return startYear;
  assignIfDefined(data, 'startYear', startYear.data);

  const endYear = parseOptionalNullableYear(input.endYear, 'endYear');
  if (!endYear.ok) return endYear;
  assignIfDefined(data, 'endYear', endYear.data);

  const priority = parseOptionalEnum(
    input.priority,
    'priority',
    EXPENSE_PRIORITIES
  );
  if (!priority.ok) return priority;
  assignIfDefined(data, 'priority', priority.data);

  const purpose = parseOptionalString(input.purpose, 'purpose');
  if (!purpose.ok) return purpose;
  assignIfDefined(data, 'purpose', purpose.data);

  const coveredByStepId = parseOptionalId(
    input.coveredByStepId,
    'coveredByStepId'
  );
  if (!coveredByStepId.ok) return coveredByStepId;
  assignIfDefined(data, 'coveredByStepId', coveredByStepId.data);

  const notes = parseOptionalString(input.notes, 'notes');
  if (!notes.ok) return notes;
  assignIfDefined(data, 'notes', notes.data);

  const sortOrder = parseOptionalSortOrder(input.sortOrder, 'sortOrder');
  if (!sortOrder.ok) return sortOrder;
  assignIfDefined(data, 'sortOrder', sortOrder.data);

  return { ok: true, data };
}

export const createStrategyExpenseSchema: StrategySchema<CreateStrategyExpenseInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      return parseStrategyExpenseFields(input, {
        requireTitle: true,
      }) as ValidationResult<CreateStrategyExpenseInput>;
    },
  };

export const updateStrategyExpenseSchema: StrategySchema<UpdateStrategyExpenseInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      const result = parseStrategyExpenseFields(input, { requireTitle: false });
      if (!result.ok) return result;

      if (Object.keys(result.data).length === 0) {
        return fail('At least one field is required to update');
      }

      return result as ValidationResult<UpdateStrategyExpenseInput>;
    },
  };

function parseStrategyProjectionMilestoneFields(
  input: Record<string, unknown>,
  options: { requireCreateFields: boolean }
): ValidationResult<
  CreateStrategyProjectionMilestoneInput | UpdateStrategyProjectionMilestoneInput
> {
  const data: UpdateStrategyProjectionMilestoneInput = {};

  if (options.requireCreateFields) {
    const year = parseRequiredYear(input.year, 'year');
    if (!year.ok) return year;
    data.year = year.data;

    const title = parseRequiredString(input.title, 'title');
    if (!title.ok) return title;
    data.title = title.data;

    const type = parseRequiredEnum(
      input.type,
      'type',
      PROJECTION_MILESTONE_TYPES
    );
    if (!type.ok) return type;
    data.type = type.data;
  } else {
    const year = parseOptionalYear(input.year, 'year');
    if (!year.ok) return year;
    assignIfDefined(data, 'year', year.data);

    if (input.title !== undefined) {
      const title = parseRequiredString(input.title, 'title');
      if (!title.ok) return title;
      data.title = title.data;
    }

    const type = parseOptionalEnum(
      input.type,
      'type',
      PROJECTION_MILESTONE_TYPES
    );
    if (!type.ok) return type;
    assignIfDefined(data, 'type', type.data);
  }

  const stepId = parseOptionalId(input.stepId, 'stepId');
  if (!stepId.ok) return stepId;
  assignIfDefined(data, 'stepId', stepId.data);

  const monthlyIncome = parseOptionalMoney(input.monthlyIncome, 'monthlyIncome');
  if (!monthlyIncome.ok) return monthlyIncome;
  assignIfDefined(data, 'monthlyIncome', monthlyIncome.data);

  const monthsOfIncome = parseOptionalNonNegativeInt(
    input.monthsOfIncome,
    'monthsOfIncome'
  );
  if (!monthsOfIncome.ok) return monthsOfIncome;
  assignIfDefined(data, 'monthsOfIncome', monthsOfIncome.data);

  const annualIncome = parseOptionalMoney(input.annualIncome, 'annualIncome');
  if (!annualIncome.ok) return annualIncome;
  assignIfDefined(data, 'annualIncome', annualIncome.data);

  const capitalInvested = parseOptionalMoney(
    input.capitalInvested,
    'capitalInvested'
  );
  if (!capitalInvested.ok) return capitalInvested;
  assignIfDefined(data, 'capitalInvested', capitalInvested.data);

  const capitalRemaining = parseOptionalMoney(
    input.capitalRemaining,
    'capitalRemaining'
  );
  if (!capitalRemaining.ok) return capitalRemaining;
  assignIfDefined(data, 'capitalRemaining', capitalRemaining.data);

  const incomeThisPeriod = parseOptionalMoney(
    input.incomeThisPeriod,
    'incomeThisPeriod'
  );
  if (!incomeThisPeriod.ok) return incomeThisPeriod;
  assignIfDefined(data, 'incomeThisPeriod', incomeThisPeriod.data);

  const cumulativeIncome = parseOptionalMoney(
    input.cumulativeIncome,
    'cumulativeIncome'
  );
  if (!cumulativeIncome.ok) return cumulativeIncome;
  assignIfDefined(data, 'cumulativeIncome', cumulativeIncome.data);

  const totalAssetPosition = parseOptionalMoney(
    input.totalAssetPosition,
    'totalAssetPosition'
  );
  if (!totalAssetPosition.ok) return totalAssetPosition;
  assignIfDefined(data, 'totalAssetPosition', totalAssetPosition.data);

  const expensesThisYear = parseOptionalMoney(
    input.expensesThisYear,
    'expensesThisYear'
  );
  if (!expensesThisYear.ok) return expensesThisYear;
  assignIfDefined(data, 'expensesThisYear', expensesThisYear.data);

  const cumulativeExpenses = parseOptionalMoney(
    input.cumulativeExpenses,
    'cumulativeExpenses'
  );
  if (!cumulativeExpenses.ok) return cumulativeExpenses;
  assignIfDefined(data, 'cumulativeExpenses', cumulativeExpenses.data);

  const netCashflowThisYear = parseOptionalSignedMoney(
    input.netCashflowThisYear,
    'netCashflowThisYear'
  );
  if (!netCashflowThisYear.ok) return netCashflowThisYear;
  assignIfDefined(data, 'netCashflowThisYear', netCashflowThisYear.data);

  const capitalReturnedThisYear = parseOptionalMoney(
    input.capitalReturnedThisYear,
    'capitalReturnedThisYear'
  );
  if (!capitalReturnedThisYear.ok) return capitalReturnedThisYear;
  assignIfDefined(data, 'capitalReturnedThisYear', capitalReturnedThisYear.data);

  const capitalReturnedToDate = parseOptionalMoney(
    input.capitalReturnedToDate,
    'capitalReturnedToDate'
  );
  if (!capitalReturnedToDate.ok) return capitalReturnedToDate;
  assignIfDefined(data, 'capitalReturnedToDate', capitalReturnedToDate.data);

  const selectedStepIds = parseOptionalIdList(
    input,
    'selectedStepIds',
    'sourceStepIds'
  );
  if (!selectedStepIds.ok) return selectedStepIds;
  assignIfDefined(data, 'selectedStepIds', selectedStepIds.data);

  const selectedExpenseIds = parseOptionalIdList(
    input,
    'selectedExpenseIds',
    'sourceExpenseIds'
  );
  if (!selectedExpenseIds.ok) return selectedExpenseIds;
  assignIfDefined(data, 'selectedExpenseIds', selectedExpenseIds.data);

  const notes = parseOptionalString(input.notes, 'notes');
  if (!notes.ok) return notes;
  assignIfDefined(data, 'notes', notes.data);

  const sortOrder = parseOptionalSortOrder(input.sortOrder, 'sortOrder');
  if (!sortOrder.ok) return sortOrder;
  assignIfDefined(data, 'sortOrder', sortOrder.data);

  return { ok: true, data };
}

export const createStrategyProjectionMilestoneSchema: StrategySchema<CreateStrategyProjectionMilestoneInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      return parseStrategyProjectionMilestoneFields(input, {
        requireCreateFields: true,
      }) as ValidationResult<CreateStrategyProjectionMilestoneInput>;
    },
  };

export const updateStrategyProjectionMilestoneSchema: StrategySchema<UpdateStrategyProjectionMilestoneInput> =
  {
    parse(input) {
      if (!isPlainObject(input)) {
        return fail('Request body must be an object');
      }

      const result = parseStrategyProjectionMilestoneFields(input, {
        requireCreateFields: false,
      });
      if (!result.ok) return result;

      if (Object.keys(result.data).length === 0) {
        return fail('At least one field is required to update');
      }

      return result as ValidationResult<UpdateStrategyProjectionMilestoneInput>;
    },
  };

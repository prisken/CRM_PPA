/**
 * Unit tests for Strategy Planner timeline calculation helpers.
 *
 * Run: npm run test:strategy-timeline
 */
import {
  buildProjectionMilestoneSuggestionFromSources,
  getStrategyExpenseAmountInYear,
  getStrategyExpenseAnnualAmount,
  getStrategyExpenseCumulativeToYear,
  getStrategyExpenseTotal,
  getStrategyStepAnnualIncome,
  getStrategyStepCapitalReturnedInYear,
  getStrategyStepCapitalReturnedToYear,
  getStrategyStepCumulativeIncomeToYear,
  getStrategyStepIllustrativeTotalPosition,
  getStrategyStepIncomeInYear,
  getStrategyStepTotalIncome,
  type StrategyTimelineExpenseInput,
  type StrategyTimelineStepInput,
} from '../lib/clientStrategyTimelineCalculations';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(
  actual: number | null | string,
  expected: number | null | string,
  message: string
) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

const investmentExample: StrategyTimelineStepInput = {
  investmentAmount: 100_000,
  incomeAmount: 1_000,
  incomeFrequency: 'MONTHLY',
  incomeStartYear: 2026,
  incomeEndYear: 2030,
  capitalReturned: 100_000,
  capitalReturnYear: 2030,
};

const monthlyExpense: StrategyTimelineExpenseInput = {
  amount: 2_000,
  frequency: 'MONTHLY',
  startYear: 2026,
  endYear: 2030,
};

const oneTimeExpense: StrategyTimelineExpenseInput = {
  amount: 100_000,
  frequency: 'ONE_TIME',
  startYear: 2026,
  endYear: 2026,
};

function testInvestmentExample() {
  assertEqual(
    getStrategyStepAnnualIncome(investmentExample),
    12_000,
    'annual income 1000 × 12'
  );
  assertEqual(
    getStrategyStepIncomeInYear(investmentExample, 2026),
    12_000,
    'income in 2026'
  );
  assertEqual(
    getStrategyStepIncomeInYear(investmentExample, 2030),
    12_000,
    'income in 2030'
  );
  assertEqual(
    getStrategyStepIncomeInYear(investmentExample, 2031),
    0,
    'income after end year is 0'
  );
  assertEqual(
    getStrategyStepCumulativeIncomeToYear(investmentExample, 2030),
    60_000,
    'cumulative income through 2030'
  );
  assertEqual(
    getStrategyStepTotalIncome(investmentExample),
    60_000,
    'total income over 2026–2030'
  );
  assertEqual(
    getStrategyStepCapitalReturnedInYear(investmentExample, 2030),
    100_000,
    'capital returned in 2030'
  );
  assertEqual(
    getStrategyStepCapitalReturnedInYear(investmentExample, 2029),
    0,
    'capital returned before return year is 0'
  );
  assertEqual(
    getStrategyStepCapitalReturnedToYear(investmentExample, 2030),
    100_000,
    'capital returned to 2030'
  );
  assertEqual(
    getStrategyStepIllustrativeTotalPosition(investmentExample),
    160_000,
    'illustrative total position before expenses'
  );
}

function testMonthlyExpense() {
  assertEqual(
    getStrategyExpenseAnnualAmount(monthlyExpense),
    24_000,
    'annual expense 2000 × 12'
  );
  assertEqual(
    getStrategyExpenseAmountInYear(monthlyExpense, 2028),
    24_000,
    'expense in active year'
  );
  assertEqual(
    getStrategyExpenseTotal(monthlyExpense),
    120_000,
    'total expense over 2026–2030'
  );
  assertEqual(
    getStrategyExpenseCumulativeToYear(monthlyExpense, 2030),
    120_000,
    'cumulative expense through 2030'
  );
}

function testOneTimeExpense() {
  assertEqual(
    getStrategyExpenseAmountInYear(oneTimeExpense, 2026),
    100_000,
    'one-time expense in 2026'
  );
  assertEqual(
    getStrategyExpenseAmountInYear(oneTimeExpense, 2027),
    0,
    'one-time expense in 2027 is 0'
  );
  assertEqual(
    getStrategyExpenseTotal(oneTimeExpense),
    100_000,
    'one-time total'
  );
  assertEqual(
    getStrategyExpenseCumulativeToYear(oneTimeExpense, 2030),
    100_000,
    'one-time cumulative after start year'
  );
  assertEqual(
    getStrategyExpenseCumulativeToYear(oneTimeExpense, 2025),
    0,
    'one-time cumulative before start year is 0'
  );
  assertEqual(
    getStrategyExpenseAnnualAmount(oneTimeExpense),
    null,
    'one-time has no annual recurring amount'
  );
}

function testMilestoneSuggestion() {
  const suggestion = buildProjectionMilestoneSuggestionFromSources({
    year: 2030,
    steps: [investmentExample],
    expenses: [oneTimeExpense],
  });

  assertEqual(suggestion.incomeThisYear, 12_000, 'milestone income this year');
  assertEqual(suggestion.cumulativeIncome, 60_000, 'milestone cumulative income');
  assertEqual(
    suggestion.capitalReturnedThisYear,
    100_000,
    'milestone capital returned this year'
  );
  assertEqual(
    suggestion.capitalReturnedToDate,
    100_000,
    'milestone capital returned to date'
  );
  assertEqual(
    suggestion.expensesThisYear,
    0,
    'one-time expense not in 2030 → expenses this year 0'
  );
  assertEqual(
    suggestion.cumulativeExpenses,
    100_000,
    'cumulative expenses includes one-time'
  );
  assertEqual(
    suggestion.netCashflowThisYear,
    12_000,
    'net cashflow this year = income - expenses'
  );
  assertEqual(
    suggestion.totalAssetPosition,
    60_000,
    'totalAssetPosition = cumulativeIncome - cumulativeExpenses + capitalReturnedToDate'
  );
}

function testMissingValuesReturnNull() {
  assertEqual(
    getStrategyStepAnnualIncome({}),
    null,
    'missing income → null annual'
  );
  assertEqual(
    getStrategyStepIncomeInYear(
      { incomeAmount: 1000, incomeFrequency: 'MONTHLY' },
      2026
    ),
    null,
    'missing income years → null'
  );
  assertEqual(
    getStrategyStepTotalIncome({
      incomeAmount: 1000,
      incomeFrequency: 'CUSTOM',
      incomeStartYear: 2026,
      incomeEndYear: 2030,
    }),
    null,
    'CUSTOM frequency → null'
  );
  assertEqual(
    getStrategyStepCapitalReturnedInYear(
      { capitalReturned: 100_000 },
      2030
    ),
    null,
    'missing capitalReturnYear → null'
  );
  assertEqual(
    getStrategyStepIllustrativeTotalPosition({
      incomeAmount: 1000,
      incomeFrequency: 'MONTHLY',
      incomeStartYear: 2026,
      incomeEndYear: 2030,
    }),
    null,
    'missing capitalReturned → null illustrative position'
  );
  assertEqual(
    getStrategyExpenseAmountInYear({ amount: 100, frequency: 'MONTHLY' }, 2026),
    null,
    'missing expense years → null'
  );
  assertEqual(
    getStrategyExpenseTotal({
      amount: 100,
      frequency: 'YEARLY',
      startYear: 2030,
      endYear: 2020,
    }),
    null,
    'invalid year range → null'
  );

  const emptySuggestion = buildProjectionMilestoneSuggestionFromSources({
    year: 2030,
    steps: [],
    expenses: [],
  });
  assertEqual(emptySuggestion.incomeThisYear, null, 'no steps → null income');
  assertEqual(
    emptySuggestion.expensesThisYear,
    null,
    'no expenses → null expenses'
  );
  assertEqual(
    emptySuggestion.totalAssetPosition,
    null,
    'no sources → null total asset position'
  );
}

function main() {
  testInvestmentExample();
  testMonthlyExpense();
  testOneTimeExpense();
  testMilestoneSuggestion();
  testMissingValuesReturnNull();
  console.log('PASS: client strategy timeline calculations');
}

main();

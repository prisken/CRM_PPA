/**
 * Pure helpers for Important Date CLIENT vs LEAD labeling.
 * Kept free of Prisma / server imports so client components can use them safely.
 */

/** Lead vs Client label for calendar: ACTIVE_CLIENT → Client; other non-archived → Lead. */
export function classifyImportantDateRecordType(
  status: string
): 'Lead' | 'Client' {
  return status === 'ACTIVE_CLIENT' ? 'Client' : 'Lead';
}

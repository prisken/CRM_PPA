import type { Client360CoreData } from '@/lib/client360';
import type { DuplicateReviewClient } from '@/lib/leadDuplicates';

export function mapClient360CoreToMergeClient(
  core: Client360CoreData,
  options: {
    sourceLabels?: string[];
    dealCount?: number;
    activityCount?: number;
    priority?: string | null;
    nextAction?: string | null;
    nextFollowUpAt?: string | null;
  } = {}
): DuplicateReviewClient {
  return {
    clientId: core.client_id,
    name: core.name,
    company: core.company,
    email: core.email,
    phone: core.phone,
    leadSource: core.lead_source,
    roleInCompany: core.roleInCompany,
    employeeCount: core.employeeCount,
    expectations: core.expectations,
    contactInfo: core.contactInfo,
    status: core.status,
    createdAt: core.createdAt,
    lastModified: core.lastModified,
    sourceLabels:
      options.sourceLabels ??
      (core.lead_source?.trim() ? [core.lead_source] : []),
    assignedUsers: core.assignedUsers.map((user) => ({
      assignmentId: user.assignment_id,
      userId: user.user_id,
      name: user.name,
      email: '',
      role: user.role,
    })),
    activityCount: options.activityCount ?? 0,
    dealCount: options.dealCount ?? 0,
    priority: options.priority ?? null,
    nextAction: options.nextAction ?? null,
    nextFollowUpAt: options.nextFollowUpAt ?? null,
  };
}

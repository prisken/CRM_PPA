export function normalizeEmail(email?: string | null): string | null {
  if (typeof email !== 'string') {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePhone(phone?: string | null): string | null {
  if (typeof phone !== 'string') {
    return null;
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }

  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) {
    return null;
  }

  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

export function normalizeName(name?: string | null): string | null {
  if (typeof name !== 'string') {
    return null;
  }

  const normalized = name.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

export function normalizeCompany(company?: string | null): string | null {
  if (typeof company !== 'string') {
    return null;
  }

  const normalized = company.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

export function compactString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const compacted = value.trim();
  return compacted.length > 0 ? compacted : null;
}

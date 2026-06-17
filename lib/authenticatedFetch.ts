export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  return fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
}

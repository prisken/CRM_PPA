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
  const response = await fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('token');
  }

  return response;
}

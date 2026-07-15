'use client';

import { useMemo, useState } from 'react';

export type ParticipantUserOption = {
  user_id: string;
  userName: string;
  email?: string;
};

type ParticipantUserPickerProps = {
  users: ParticipantUserOption[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

const SEARCH_THRESHOLD = 8;

export default function ParticipantUserPicker({
  users,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select user',
}: ParticipantUserPickerProps) {
  const [query, setQuery] = useState('');

  const showSearch = users.length >= SEARCH_THRESHOLD;

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) => {
      const haystack = `${user.userName} ${user.email ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query, users]);

  const selectedUser = users.find((user) => user.user_id === value);

  return (
    <div className="min-w-[12rem] space-y-1.5">
      {showSearch && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search users..."
          disabled={disabled}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
        />
      )}

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
      >
        <option value="">{placeholder}</option>
        {filteredUsers.map((user) => (
          <option key={user.user_id} value={user.user_id}>
            {user.userName}
            {user.email ? ` (${user.email})` : ''}
          </option>
        ))}
      </select>

      {showSearch && query.trim() && filteredUsers.length === 0 && (
        <p className="text-[11px] text-gray-500">No users match your search.</p>
      )}

      {selectedUser && !filteredUsers.some((user) => user.user_id === value) && (
        <p className="text-[11px] text-gray-600">
          Selected: {selectedUser.userName}
        </p>
      )}
    </div>
  );
}

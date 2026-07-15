'use client';

type MultiValueTextFieldProps = {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
  addLabel?: string;
  disabled?: boolean;
};

/**
 * Compact multi-entry text field for emails / phones.
 * First value is treated as primary by the API.
 */
export default function MultiValueTextField({
  id,
  label,
  values,
  onChange,
  type = 'text',
  placeholder,
  addLabel = 'Add another',
  disabled = false,
}: MultiValueTextFieldProps) {
  const rows = values.length > 0 ? values : [''];

  function updateAt(index: number, value: string) {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  }

  function removeAt(index: number) {
    if (rows.length <= 1) {
      onChange(['']);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...rows, '']);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={`${id}-0`} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        {!disabled && (
          <button
            type="button"
            onClick={addRow}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
          >
            {addLabel}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((value, index) => (
          <div key={`${id}-${index}`} className="flex items-center gap-2">
            <input
              id={`${id}-${index}`}
              type={type}
              value={value}
              disabled={disabled}
              placeholder={
                placeholder ??
                (index === 0 ? undefined : `Additional ${label.toLowerCase()}`)
              }
              onChange={(event) => updateAt(index, event.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
            />
            {rows.length > 1 && !disabled && (
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                className="shrink-0 rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-500 hover:bg-gray-50"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {rows.length > 1 && (
        <p className="mt-1 text-xs text-gray-500">
          First entry is the primary {label.toLowerCase()}.
        </p>
      )}
    </div>
  );
}

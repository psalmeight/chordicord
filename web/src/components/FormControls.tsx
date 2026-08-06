import { Box, Text } from '@chakra-ui/react';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

export function Select({
  value,
  onChange,
  options,
  emptyLabel = '—',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /** Label for the '' option, when blank needs to read as more than a dash. */
  emptyLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid var(--line)',
        background: 'white',
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt || emptyLabel}
        </option>
      ))}
    </select>
  );
}

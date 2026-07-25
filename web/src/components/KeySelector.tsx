import { Button, HStack, Text } from '@chakra-ui/react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { keyOptions, semitonesBetween } from '@/lib/chords';

interface Props {
  /** The song's own key — what the stored chords are written in. */
  originalKey: string;
  /** The key currently being displayed. */
  value: string;
  onChange: (key: string) => void;
}

/**
 * Step up/down by a semitone or jump straight back to the original key.
 * Selecting a key never rewrites the song — it only changes what's rendered.
 */
export default function KeySelector({ originalKey, value, onChange }: Props) {
  const options = keyOptions(originalKey);
  const current = semitonesBetween(originalKey, value);

  const step = (delta: number) => {
    const next = (((current + delta) % 12) + 12) % 12;
    onChange(options[next]?.key ?? originalKey);
  };

  return (
    <HStack gap={2}>
      <Button size="sm" variant="outline" onClick={() => step(-1)} aria-label="Down a semitone">
        <Minus size={14} />
      </Button>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid #CBD5E0',
          fontWeight: 600,
          minWidth: 110,
        }}
      >
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>

      <Button size="sm" variant="outline" onClick={() => step(1)} aria-label="Up a semitone">
        <Plus size={14} />
      </Button>

      {value !== originalKey && (
        <Button size="sm" variant="ghost" onClick={() => onChange(originalKey)}>
          <RotateCcw size={14} />
          <Text ml={1}>Original ({originalKey})</Text>
        </Button>
      )}
    </HStack>
  );
}

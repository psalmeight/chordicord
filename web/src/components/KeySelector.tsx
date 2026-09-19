import { Button, HStack, Text } from '@chakra-ui/react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { keyOptions, normalizeKey, semitonesBetween } from '@/lib/chords';
import { Select } from '@/components/FormControls';

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

      {/* Matched on the app's spelling, not the stored one: a song saved as
          "Ab" is the same pitch as the "G#" this list offers, and without the
          respelling the dropdown would show a key nobody picked. */}
      <Select
        value={normalizeKey(value)}
        onChange={onChange}
        options={options.map((opt) => ({ value: opt.key, label: opt.label }))}
        size="sm"
        width="auto"
        minW="110px"
        triggerProps={{ fontWeight: 'semibold' }}
      />

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

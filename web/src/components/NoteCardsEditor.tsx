import { Box, Button, Flex, HStack, Stack, Text, Textarea } from '@chakra-ui/react';
import { Plus, Trash2 } from 'lucide-react';
import { sectionNames } from '@/lib/chordpro';
import { NOTE_COLORS, noteColor } from '@/lib/noteColors';
import type { NoteCard } from '@/types';

/** The colour-coded note cards editor. `content` is the chart source the
 *  section anchors are derived from. */
export default function NoteCardsEditor({
  cards,
  content,
  onChange,
}: {
  cards: NoteCard[];
  content: string;
  onChange: (cards: NoteCard[]) => void;
}) {
  const addCard = () => onChange([...cards, { color: 'amber', text: '', section: '' }]);
  const patchCard = (i: number, patch: Partial<NoteCard>) =>
    onChange(cards.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeCard = (i: number) => onChange(cards.filter((_, j) => j !== i));

  // Anchor targets: the chart's sections, plus any section a card still points
  // at even after it was renamed/removed, so that choice isn't silently lost.
  const secs = sectionNames(content);
  const known = new Set(secs.map((s) => s.toLowerCase()));
  const orphaned = [
    ...new Set(cards.map((c) => c.section).filter((s) => s && !known.has(s.toLowerCase()))),
  ];
  const sectionOptions = [...secs, ...orphaned];

  return (
    <Stack gap={2}>
      {cards.map((card, i) => {
        const c = noteColor(card.color);
        return (
          <Box
            key={i}
            borderWidth="1px"
            borderRadius="md"
            borderLeftWidth="4px"
            borderColor={c.border}
            bg={c.bg}
            p={3}
          >
            <Flex gap={2} align="center" mb={2} wrap="wrap">
              <HStack gap={1}>
                {NOTE_COLORS.map((nc) => (
                  <Box
                    as="button"
                    key={nc.key}
                    onClick={() => patchCard(i, { color: nc.key })}
                    w="20px"
                    h="20px"
                    borderRadius="full"
                    bg={nc.swatch}
                    cursor="pointer"
                    borderWidth={card.color === nc.key ? '2px' : '1px'}
                    borderColor={card.color === nc.key ? 'gray.800' : 'blackAlpha.300'}
                    title={nc.label}
                    aria-label={nc.label}
                  />
                ))}
              </HStack>
              <Box flex="1" />
              <select
                value={card.section}
                onChange={(e) => patchCard(i, { section: e.target.value })}
                title="Where this note appears"
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line-2)', maxWidth: 170 }}
              >
                <option value="">General (top)</option>
                {sectionOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <Button
                size="xs"
                variant="ghost"
                colorPalette="red"
                onClick={() => removeCard(i)}
                aria-label="Remove note"
              >
                <Trash2 size={14} />
              </Button>
            </Flex>
            <Textarea
              value={card.text}
              onChange={(e) => patchCard(i, { text: e.target.value })}
              placeholder="Arrangement note, cue, caution…"
              rows={2}
              bg="white"
            />
          </Box>
        );
      })}
      <Button size="sm" variant="outline" alignSelf="start" onClick={addCard}>
        <Plus size={14} />
        <Text ml={1}>Add note</Text>
      </Button>
    </Stack>
  );
}

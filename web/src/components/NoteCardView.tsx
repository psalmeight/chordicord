import { Box, Stack, Text } from '@chakra-ui/react';
import { noteColor } from '@/lib/noteColors';
import type { NoteCard } from '@/types';

/** One coloured note callout. */
export function NoteCardView({ card }: { card: NoteCard }) {
  const c = noteColor(card.color);
  return (
    <Box bg={c.bg} borderRadius="md" borderLeftWidth="3px" borderColor={c.border} px={3} py={2}>
      <Text fontSize="sm" color={c.fg} whiteSpace="pre-wrap">
        {card.text}
      </Text>
    </Box>
  );
}

/** A stack of note callouts, or nothing when the list is empty. */
export function NoteCardList({ cards, mt }: { cards: NoteCard[]; mt?: number }) {
  if (!cards.length) return null;
  return (
    <Stack gap={2} mt={mt}>
      {cards.map((card, i) => (
        <NoteCardView key={i} card={card} />
      ))}
    </Stack>
  );
}

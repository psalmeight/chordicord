import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { Info, X } from 'lucide-react';
import { useState } from 'react';
import ChordChart from '@/components/ChordChart';

/**
 * One rule of the format: the source on the left, what it turns into on the
 * right. `source` feeds both sides, so an example can't claim something the
 * renderer doesn't actually do.
 */
export const RULES: { source: string; caption: string; hidden?: boolean }[] = [
  {
    source: 'G                  C\nAmazing grace how sweet',
    caption: 'Chords on their own line — each lands on whatever it sits over.',
  },
  {
    source: '[G]Amazing [C]grace',
    caption: 'Or inline, anchored to the syllable after them. Mix the two freely.',
  },
  {
    source: '| G | C | G | D |    *2x*',
    caption: 'A chord-only line, kept exactly as written.',
  },
  {
    source: 'Amazing *softly* grace',
    caption:
      'Asterisks turn a cue red — in a lyric, on a chord row, or alone on its own line above one.',
  },
  {
    source: 'Amazing ^^watch me^^ grace',
    caption:
      'Double carets do the same, but the cue blinks — for the one you have to catch mid-song. Goes anywhere asterisks do.',
  },
  {
    source: '{Verse 1}',
    caption: 'A section header.',
  },
  {
    source: '## Big text\n### A size down\n#### Smaller again',
    caption: 'Oversized lines for titles and callouts, in three sizes.',
  },
  {
    source: '# just for me',
    hidden: true,
    caption: 'A single # is a comment. It never reaches the chart.',
  },
];

/**
 * The format reference, as a floating widget stacked above the metronome.
 *
 * It was a paragraph of prose above the textarea, which is the worst place for
 * it: too long to read while you're typing, too permanent to ever stop paying
 * for the space. On demand, and showing the output beside the input, it answers
 * the question people actually have — what do I type to get *that*.
 *
 * Deliberately not a dismiss-on-blur popover. It is a reference held open
 * *while* you type in the editor behind it, so clicking into the textarea must
 * not close it: the only ways out are the button again and the X.
 */
export default function ChartSyntaxGuide() {
  const [open, setOpen] = useState(false);

  // Parked one button-height above the metronome, which owns bottom: 20px. A
  // step above it in the stack too: the metronome's own panel opens upward
  // through this spot, and would otherwise bury the button it sits under.
  return (
    <Box position="fixed" bottom="84px" right="20px" zIndex={1401} className="no-print">
      {open && (
        <Box
          w={{ base: 'min(320px, calc(100vw - 40px))', sm: '420px' }}
          maxH="min(70vh, 560px)"
          overflowY="auto"
          bg="white"
          borderWidth="1px"
          borderRadius="xl"
          boxShadow="lg"
          p={4}
          mb={3}
        >
          <Flex justify="space-between" align="center" mb={1}>
            <Text fontWeight="semibold">Writing a chart</Text>
            <Button size="xs" variant="ghost" onClick={() => setOpen(false)} aria-label="Close the guide">
              <X size={14} />
            </Button>
          </Flex>
          <Text fontSize="xs" color="gray.600" mb={3}>
            What you type, and what it becomes.
          </Text>

          {RULES.map((rule) => (
            <Box key={rule.source} mb={3} pb={3} borderBottomWidth="1px" borderColor="gray.100">
              {/* Stacked, not side by side: split in two, each half was
                  narrower than a chord row and every example scrolled
                  sideways. Full width apiece, almost none of them do. */}
              <Box
                className="chart-source"
                bg="gray.50"
                borderRadius="md"
                px={2}
                py={1}
                fontSize="12px"
                lineHeight="1.5"
                whiteSpace="pre"
                overflowX="auto"
              >
                {rule.source}
              </Box>
              <Box mt={2} pl={3} borderLeftWidth="2px" borderColor="brand.200">
                {rule.hidden ? (
                  <Text fontSize="xs" color="gray.400" fontStyle="italic">
                    nothing — it never shows
                  </Text>
                ) : (
                  <ChordChart content={rule.source} fromKey="" toKey="" fontSize={13} />
                )}
              </Box>
              <Text fontSize="xs" color="gray.600" mt={1.5}>
                {rule.caption}
              </Text>
            </Box>
          ))}

          <Text fontSize="xs" color="gray.500">
            Chords line up by column, so the editor uses a monospace font — what you see above a
            syllable is what the chart reads.
          </Text>
        </Box>
      )}

      <Flex justify="flex-end">
        <Button
          borderRadius="full"
          h="52px"
          w="52px"
          px={0}
          colorPalette="brand"
          variant={open ? 'solid' : 'outline'}
          bg={open ? undefined : 'white'}
          boxShadow="0 1px 3px rgba(0,0,0,0.2)"
          onClick={() => setOpen((v) => !v)}
          title="How to write a chart"
          aria-label="How to write a chart"
          aria-expanded={open}
        >
          <Info size={20} />
        </Button>
      </Flex>
    </Box>
  );
}

import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { Info, X } from 'lucide-react';
import { useState } from 'react';
import { useMetronome } from '@/contexts/MetronomeContext';
import { ChartV2Text } from '@/components/ChartV2';

/**
 * One rule of the format: the source on the left, what it turns into on the
 * right. `source` feeds both sides, so an example can't claim something the
 * renderer doesn't actually do.
 */
export const V2_RULES: { source: string; caption: string }[] = [
  {
    source: 'G          C\nAmazing grace how sweet',
    caption:
      'Chords on their own line, directly above the lyric. Line each one up over the syllable it lands on — with spaces, not tabs.',
  },
  {
    source: '[###Chorus]\n[##Bigger]\n[#Biggest]',
    caption:
      'Hashes inside brackets make a heading, markdown-style: bold, and bigger with fewer hashes. Use it for section names — [###Verse 1], [###Chorus] — with a blank line between sections and none between a chord row and its lyric.',
  },
  {
    source: '[| A | G - B |]',
    caption:
      'Anything in square brackets is drawn exactly as typed, in chord styling — for a chord line the chart wouldn\'t recognise on its own, like bars with dashes or slashes.',
  },
  {
    source: '| G | C | G | D |',
    caption: 'A line that is nothing but chords is coloured without any brackets — for an intro, a turnaround, an instrumental.',
  },
  {
    source: 'Amazing *softly* grace\n*build here*',
    caption: 'Stars turn text bold red — a cue, in a lyric or on a line of its own.',
  },
  {
    source: '| G | C | G | D |   x2',
    caption: 'x2 after the chords for a repeat.',
  },
  {
    source: 'N.C.\nAmazing grace how sweet',
    caption: 'N.C. — no chord — where nothing is played.',
  },
  {
    source: 'Am   Dsus4   Em/B   G7   F#m7',
    caption:
      'Spell chords with a capital root and the rest lowercase: Am, Dsus4, Em/B, G7. A row is coloured only when every word on it is a chord, so anything else on a chord row makes it read as words.',
  },
  {
    source: 'G\nAmazing grace how sweet the sound\nThat saved a wretch like me\nG\nI once was lost but now am found',
    caption:
      "Skip a chord that doesn't change from line to line — but show the chords again at least every fourth line, so nobody has to hunt for them.",
  },
  {
    source: 'G          C\nAmazing grace how sweet',
    caption:
      "Write in the song's own key. The key picker and capo transpose what's shown; the text you save never changes key.",
  },
];

/**
 * The format reference for the v2 (Ultimate Guitar style) chart, as a
 * floating widget in the corner — the same spot, shell and behaviour as the
 * classic guide, shown in its place while the new editor is on.
 *
 * Deliberately not a dismiss-on-blur popover. It is a reference held open
 * *while* you type in the editor behind it, so clicking into the textarea must
 * not close it: the only ways out are the button again and the X.
 */
export default function ChartV2Guide() {
  const [open, setOpen] = useState(false);
  const { editing } = useMetronome();

  // Positioned exactly as ChartSyntaxGuide is: beside the metronome, and up
  // into the corner while a song editor holds the bottom edge.
  return (
    <Box
      position="fixed"
      bottom={editing ? '84px' : '20px'}
      right={editing ? '20px' : '80px'}
      zIndex={1401}
      className="no-print"
    >
      {open && (
        <Box
          w={{ base: 'min(320px, calc(100vw - 40px))', sm: '440px' }}
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
            Plain text, the way Ultimate Guitar writes it, plus three marks: [brackets] for chord styling,
            [###Heading], and *red text*. The marks themselves are not shown.
          </Text>

          {V2_RULES.map((rule, i) => (
            <Box key={i} mb={3} pb={3} borderBottomWidth="1px" borderColor="gray.100">
              <Box bg="gray.50" borderRadius="md" px={2} py={1} overflowX="auto">
                <ChartV2Text text={rule.source} fontSize={13} />
              </Box>
              <Text fontSize="xs" color="gray.600" mt={1.5}>
                {rule.caption}
              </Text>
            </Box>
          ))}

          <Text fontSize="xs" color="gray.500">
            The chart uses a monospace font, so a chord sits over whichever syllable it was typed over.
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

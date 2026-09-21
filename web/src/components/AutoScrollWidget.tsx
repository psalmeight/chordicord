import { Box, Button, Flex, HStack, Text } from '@chakra-ui/react';
import { Minus, Pause, Play, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import StepButton from '@/components/StepButton';
import { MAX_SPEED, MIN_SPEED, SPEED_STEP, useAutoScroll } from '@/lib/useAutoScroll';

/** What the inline group is telling you: moving, parked by a gesture and
 *  about to resume, or stopped and waiting for a tap on the centre button. */
type Tone = 'running' | 'parked' | 'stopped';

/** Colours for one segment of the group. Solid green while it moves, washed
 *  out while a gesture has it parked, white with a green edge while stopped. */
const tone = (t: Tone) => ({
  bg: t === 'running' ? 'green.500' : t === 'parked' ? 'green.100' : 'white',
  color: t === 'running' ? 'white' : t === 'parked' ? 'green.800' : 'green.700',
  _hover: { bg: t === 'running' ? 'green.600' : t === 'parked' ? 'green.200' : 'green.50' },
  _active: { bg: t === 'running' ? 'green.700' : t === 'parked' ? 'green.200' : 'green.100' },
});

/** The divider between the group's segments, in the same tone. */
const dividerColor = (t: Tone) =>
  t === 'running' ? 'green.600' : t === 'parked' ? 'green.200' : 'green.200';

/** The − and + halves of the group. Overrides StepButton's white circle; the
 *  group's rounded corners come from its clipping wrapper. */
const groupStyle = (t: Tone) => ({
  h: '52px',
  // Wider than tall: these are hit blind, mid-song, with a thumb.
  w: '68px',
  minW: '68px',
  borderWidth: 0,
  boxShadow: 'none',
  ...tone(t),
});

/**
 * Hands-free scrolling control, parked opposite the metronome so the two
 * floating widgets never overlap.
 *
 * Rendered through a portal to the body: the page content it lives in gets a
 * CSS transform while scrolling, and a transformed ancestor would turn this
 * fixed box into one that scrolls away with the page.
 */
export default function AutoScrollWidget() {
  const { running, paused, speed, setSpeed, stepSpeed, stop, start, toggle } = useAutoScroll();
  const [open, setOpen] = useState(false);

  const groupTone: Tone = !running ? 'stopped' : paused ? 'parked' : 'running';

  return createPortal(
    <Box position="fixed" bottom="20px" left="20px" zIndex={1400} className="no-print">
      {open && (
        <Box bg="white" borderWidth="1px" borderRadius="xl" boxShadow="lg" p={4} mb={3} w="250px">
          <Flex justify="space-between" align="center" mb={3}>
            <Text fontWeight="semibold">Auto-scroll</Text>
            <Button size="xs" variant="ghost" onClick={() => setOpen(false)} aria-label="Close auto-scroll">
              <X size={16} />
            </Button>
          </Flex>

          <Box borderRadius="lg" py={2} mb={3} bg={running ? 'brand.50' : 'gray.50'}>
            <Flex align="center" justify="center" gap={1}>
              <Text fontSize="4xl" fontWeight="bold" fontVariantNumeric="tabular-nums" lineHeight="1">
                {speed.toFixed(1)}
              </Text>
              <Text fontSize="sm" color="gray.500" mb={1}>
                SPEED
              </Text>
            </Flex>
          </Box>

          <HStack gap={2} mb={3}>
            <Button size="sm" variant="outline" onClick={() => setSpeed(speed - SPEED_STEP)} aria-label="Slower">
              <Minus size={14} />
            </Button>
            <input
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={SPEED_STEP}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Scroll speed"
            />
            <Button size="sm" variant="outline" onClick={() => setSpeed(speed + SPEED_STEP)} aria-label="Faster">
              <Plus size={14} />
            </Button>
          </HStack>

          <Button
            w="100%"
            colorPalette={running ? 'red' : 'brand'}
            onClick={() => (running ? stop() : start())}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            <Text ml={2}>{running ? 'Stop' : 'Start'}</Text>
          </Button>

          <Text fontSize="xs" color="gray.500" mt={3} lineHeight="1.4">
            {running && paused
              ? 'Paused while you scroll — picking up again in a moment.'
              : 'Scroll by hand at any time; it carries on from wherever you leave off.'}
          </Text>
        </Box>
      )}

      {/* Always on screen (panel closed): a fused [− play/pause speed +]
          group — green while it moves, washed out while a gesture has it
          parked, white while stopped — and a white circle for the panel. The
          centre segment is the play/pause, so a run starts and stops without
          ever opening the panel. */}
      <HStack gap={2}>
        {!open && (
          <HStack
            gap={0}
            borderRadius="full"
            overflow="hidden"
            boxShadow="0 1px 3px rgba(0,0,0,0.2)"
            borderWidth={running ? 0 : '1px'}
            borderColor="green.300"
          >
            <StepButton
              onStep={() => stepSpeed(-SPEED_STEP)}
              label="Slower"
              {...groupStyle(groupTone)}
              borderRadius={0}
              pl={2}
            >
              <Minus size={22} />
            </StepButton>
            <Button
              h="52px"
              minW="80px"
              px={3}
              borderRadius={0}
              borderXWidth="1px"
              borderColor={dividerColor(groupTone)}
              fontWeight="bold"
              fontVariantNumeric="tabular-nums"
              {...tone(groupTone)}
              onClick={toggle}
              aria-label={running ? 'Pause auto-scroll' : 'Start auto-scroll'}
              title={running ? 'Pause' : 'Start'}
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
              <Text ml={1}>{speed.toFixed(1)}</Text>
            </Button>
            <StepButton
              onStep={() => stepSpeed(SPEED_STEP)}
              label="Faster"
              {...groupStyle(groupTone)}
              borderRadius={0}
              pr={2}
            >
              <Plus size={22} />
            </StepButton>
          </HStack>
        )}
        <Button
          borderRadius="full"
          h="52px"
          w="52px"
          p={0}
          bg="white"
          color="gray.800"
          borderWidth="1px"
          borderColor="gray.200"
          _hover={{ bg: 'gray.50' }}
          onClick={() => setOpen(!open)}
          aria-label="Auto-scroll settings"
          title="Auto-scroll settings"
          boxShadow="0 1px 3px rgba(0,0,0,0.2)"
        >
          {/* Same sliders icon as the setlist's Options button: "settings",
              not "scroll down" — the group beside it does the scrolling. */}
          <SlidersHorizontal size={20} />
        </Button>
      </HStack>
    </Box>,
    document.body,
  );
}

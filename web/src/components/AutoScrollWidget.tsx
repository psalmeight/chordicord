import { Box, Button, Flex, HStack, Text } from '@chakra-ui/react';
import { ChevronsDown, Minus, Pause, Play, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { MAX_SPEED, MIN_SPEED, useAutoScroll } from '@/lib/useAutoScroll';

/**
 * Hands-free scrolling control, parked opposite the metronome so the two
 * floating widgets never overlap.
 */
export default function AutoScrollWidget() {
  const { running, paused, speed, setSpeed, stop, start } = useAutoScroll();
  const [open, setOpen] = useState(false);

  return (
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
                {speed}
              </Text>
              <Text fontSize="sm" color="gray.500" mb={1}>
                SPEED
              </Text>
            </Flex>
          </Box>

          <HStack gap={2} mb={3}>
            <Button size="sm" variant="outline" onClick={() => setSpeed(speed - 1)} aria-label="Slower">
              <Minus size={14} />
            </Button>
            <input
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Scroll speed"
            />
            <Button size="sm" variant="outline" onClick={() => setSpeed(speed + 1)} aria-label="Faster">
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

      <Flex>
        <Button
          borderRadius="full"
          h="52px"
          w={open ? '52px' : 'auto'}
          px={open ? 0 : 4}
          colorPalette={running ? 'green' : 'brand'}
          variant={running && paused ? 'outline' : 'solid'}
          bg={running && paused ? 'white' : undefined}
          onClick={() => setOpen(!open)}
          aria-label="Auto-scroll"
          title="Auto-scroll"
          boxShadow="0 1px 3px rgba(0,0,0,0.2)"
        >
          <ChevronsDown size={20} />
          {!open && (
            <Text ml={2} fontVariantNumeric="tabular-nums">
              {running ? speed : 'Auto-scroll'}
            </Text>
          )}
        </Button>
      </Flex>
    </Box>
  );
}

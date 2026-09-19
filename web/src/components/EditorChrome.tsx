import { Box, Button, Flex, HStack, Popover, Portal, Text } from '@chakra-ui/react';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The pieces the song and setlist-copy editors share, so the two look and
 * work the same: the "More details" popover on the header row, and the
 * action bar that floats at the foot of the form.
 */

/** Everything about a song beyond title, artist, key and time lives behind
 *  this one button, so the chart — the reason anyone opens an editor —
 *  starts higher. md-sized, to stand the same height as the selects beside it. */
export function MoreDetails({ children }: { children: ReactNode }) {
  return (
    <Popover.Root lazyMount unmountOnExit positioning={{ placement: 'bottom-start' }}>
      <Popover.Trigger asChild>
        <Button size="md" variant="outline" flexShrink={0} bg="white">
          <Text>More details</Text>
          <Box ml={1}>
            <ChevronDown size={14} />
          </Box>
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w={{ base: 'min(360px, calc(100vw - 32px))', sm: '420px' }} maxH="70vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Body p={4}>{children}</Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

/**
 * The action bar floats at the foot of whatever scrolls — the page, or the
 * modal's body — so Save is never a page-length away from the chart being
 * typed. Sticky rather than fixed: it stays inside its host, and comes to
 * rest in the flow once the end is reached. A pale brand wash and a heavier
 * shadow than the other cards: this one sits over the content, and it's
 * where Save lives.
 *
 * The floating widgets keep out of its way: the metronome hides while an
 * editor is up and the guide button moves above the bar.
 */
export function EditorActionBar({
  leading,
  children,
  inModal,
}: {
  /** The left end — a Back link, or a modal's Cancel. */
  leading?: ReactNode;
  /** The right end — Save, and anything beside it. */
  children: ReactNode;
  /** Hosted in a modal, whose body already pads the bottom. */
  inModal?: boolean;
}) {
  return (
    <Box
      position="sticky"
      // Two gaps: `bottom` only applies while the bar is stuck, so it's the
      // extra lift when floating; `mb` (which sticky also honours) is the
      // gap at rest, once the content's end has scrolled into view. The
      // modal's body pads its own edge, so there the two are the same 12px.
      bottom={inModal ? 0 : 4}
      mb={inModal ? 3 : 6}
      zIndex="docked"
      bg="brand.50"
      borderRadius="lg"
      borderWidth="1px"
      borderColor="brand.200"
      boxShadow="0 10px 30px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.08)"
      px={4}
      py={3}
      className="no-print"
    >
      <Flex justify="space-between" align="center" gap={3}>
        <Box>{leading}</Box>
        <HStack gap={2}>{children}</HStack>
      </Flex>
    </Box>
  );
}

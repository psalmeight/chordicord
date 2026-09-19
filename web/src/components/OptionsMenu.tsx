import { Box, Button, Flex, Popover, Portal, Stack, Text } from '@chakra-ui/react';
import { SlidersHorizontal } from 'lucide-react';
import { forwardRef } from 'react';
import type { ComponentProps, ReactNode } from 'react';

/**
 * The per-song "Options" popover, shared by the song page and every setlist
 * item so a song is handled the same wherever it appears: one labelled
 * button, and behind it labelled rows and actions rather than a toolbar.
 */
export function OptionsMenu({ children }: { children: ReactNode }) {
  return (
    <Popover.Root lazyMount unmountOnExit positioning={{ placement: 'bottom-end' }}>
      <Popover.Trigger asChild>
        <Button size="xs" variant="outline">
          <SlidersHorizontal size={14} />
          <Text ml={1}>Options</Text>
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="270px">
            <Popover.Arrow />
            <Popover.Body p={3}>
              <Stack gap={1}>{children}</Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

/** A thin rule between groups of options. */
export const OptionDivider = () => <Box borderTopWidth="1px" my={1} />;

/** A labelled control row inside the options popover. */
export function OptionRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Box>
      <Flex justify="space-between" align="baseline" mb={1}>
        <Text fontSize="xs" fontWeight="medium" color="gray.600">
          {label}
        </Text>
        {hint && (
          <Text fontSize="xs" color="gray.400">
            {hint}
          </Text>
        )}
      </Flex>
      {children}
    </Box>
  );
}

/** One action in the popover: an icon with its name written out, left-aligned
 *  so the list scans like a menu. forwardRef so Popover.CloseTrigger can wrap it. */
export const OptionButton = forwardRef<
  HTMLButtonElement,
  { icon: ReactNode; danger?: boolean } & ComponentProps<typeof Button>
>(function OptionButton({ icon, danger, children, ...rest }, ref) {
  return (
    <Button
      ref={ref}
      size="sm"
      variant="ghost"
      w="100%"
      justifyContent="flex-start"
      colorPalette={danger ? 'red' : 'gray'}
      color={danger ? 'red.600' : undefined}
      {...rest}
    >
      {icon}
      <Text ml={2}>{children}</Text>
    </Button>
  );
});

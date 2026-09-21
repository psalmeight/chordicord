import { Box, Button, Dialog, Flex, HStack, Portal, Stack, Text } from '@chakra-ui/react';
import { AlertTriangle, Check, RefreshCw, X } from 'lucide-react';

/**
 * The warning before a setlist item is re-synced from the songbank. A modal
 * rather than the browser's confirm, because the point needs to land: this
 * throws away the setlist's own edits to the song, and a one-line native box
 * reads as "OK?" more than as "this is destructive".
 *
 * `afterSave` is the variant offered right after editing the songbank song
 * from the setlist — same action, framed as the natural next step.
 */
export default function SyncConfirmDialog({
  title,
  afterSave,
  onConfirm,
  onClose,
}: {
  /** The song's title, or null when the dialog is closed. */
  title: string | null;
  afterSave?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={title !== null} onOpenChange={(e) => !e.open && onClose()} size="sm" placement="center">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Stack gap={0.5}>
                <Dialog.Title>{afterSave ? 'Saved to the songbank' : 'Update from the songbank?'}</Dialog.Title>
                <Dialog.Description fontSize="sm" color="gray.600">
                  {afterSave
                    ? `Update this setlist's copy of "${title}" from it now?`
                    : `Replace this setlist's copy of "${title}" with the songbank version.`}
                </Dialog.Description>
              </Stack>
              <Dialog.CloseTrigger asChild>
                <Button size="xs" variant="ghost" aria-label="Close">
                  <X size={16} />
                </Button>
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={3}>
                <Box
                  p={3}
                  bg="orange.50"
                  borderWidth="1px"
                  borderColor="orange.200"
                  borderRadius="md"
                >
                  <Flex gap={2} align="start" color="orange.800">
                    <Box mt="2px" flexShrink={0}>
                      <AlertTriangle size={16} />
                    </Box>
                    <Box fontSize="sm">
                      <Text fontWeight="semibold">This setlist's edits will be lost</Text>
                      <Text mt={1}>
                        Any changes made to this setlist's copy of the <strong>chart</strong>,{' '}
                        <strong>notes</strong> and <strong>key</strong> are replaced by what's in the
                        songbank. This can't be undone.
                      </Text>
                    </Box>
                  </Flex>
                </Box>
                <Flex gap={2} align="start" fontSize="sm" color="gray.700">
                  <Box mt="2px" flexShrink={0} color="green.600">
                    <Check size={16} />
                  </Box>
                  <Text>
                    Kept: everyone's <strong>capo</strong> settings and private notes, and the track's{' '}
                    <strong>tune</strong> for this setlist.
                  </Text>
                </Flex>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <HStack gap={2}>
                <Button size="sm" variant="ghost" onClick={onClose}>
                  {afterSave ? 'Keep this setlist as is' : 'Cancel'}
                </Button>
                <Button size="sm" colorPalette="orange" onClick={onConfirm}>
                  <RefreshCw size={14} />
                  <Text ml={1}>Update from songbank</Text>
                </Button>
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

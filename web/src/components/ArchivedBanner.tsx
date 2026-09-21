import { Button, Flex, Text } from '@chakra-ui/react';
import { Archive, ArchiveRestore } from 'lucide-react';
import dayjs from 'dayjs';

/** Shown at the top of a song or setlist that has been archived: it still
 *  opens (setlists link to archived songs), so say why it's missing from the
 *  lists and, for editors, offer the way back in place. */
export default function ArchivedBanner({
  what,
  archivedAt,
  onRestore,
}: {
  what: 'song' | 'setlist';
  archivedAt: string;
  onRestore?: () => void;
}) {
  return (
    <Flex
      align="center"
      justify="space-between"
      gap={3}
      wrap="wrap"
      bg="orange.50"
      borderWidth="1px"
      borderColor="orange.200"
      borderRadius="lg"
      px={4}
      py={3}
      className="no-print"
    >
      <Flex align="center" gap={2} color="orange.800">
        <Archive size={16} />
        <Text fontSize="sm">
          This {what} was archived on {dayjs(archivedAt).format('D MMM YYYY')}. It's hidden from the{' '}
          {what === 'song' ? 'songbank' : 'setlists'} until it's restored.
        </Text>
      </Flex>
      {onRestore && (
        <Button size="sm" variant="outline" colorPalette="orange" onClick={onRestore}>
          <ArchiveRestore size={16} />
          <Text ml={1}>Restore</Text>
        </Button>
      )}
    </Flex>
  );
}

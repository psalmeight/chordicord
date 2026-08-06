import { Box, Button, Flex, Grid, HStack, Text, Textarea } from '@chakra-ui/react';
import { Columns2, Rows2 } from 'lucide-react';
import { useState } from 'react';
import { hasInlineChords, toAligned } from '@/lib/chordpro';
import { groupNotes } from '@/lib/noteColors';
import type { useKeyConvert } from '@/lib/useKeyConvert';
import ChordChart from '@/components/ChordChart';
import { NoteCardList } from '@/components/NoteCardView';
import type { NoteCard } from '@/types';

const PLACEHOLDER = `{Verse 1}
G                  C         G
Amazing grace how sweet the sound
     G                    D
That saved a wretch like me

{Chorus}
| G | C | G | D |    *2x*
G            C         G
I once was lost but now am found *build*`;

/** Editor layout: source and preview side by side, or stacked with the source
 *  full-width and the preview below. Device-local, like the font setting. */
const LAYOUT_KEY = 'chordicord.editorLayout';

type EditorLayout = 'side' | 'stacked';

function storedLayout(): EditorLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'stacked' ? 'stacked' : 'side';
  } catch {
    return 'side';
  }
}

/** The transpose-or-relabel offer and its undo, rendered from a useKeyConvert
 *  instance. Lives beside the chart panels because that's the chart it edits. */
export function KeyConvertBanner({
  convert,
  targetKey,
}: {
  convert: ReturnType<typeof useKeyConvert>;
  targetKey: string;
}) {
  return (
    <>
      {convert.offerConvert && (
        <Box p={3} bg="brand.50" borderRadius="md" borderLeftWidth="3px" borderColor="brand.400">
          <Text fontSize="sm" mb={2}>
            The chart is written in <strong>{convert.contentKey}</strong> and you've selected{' '}
            <strong>{targetKey}</strong>. Should the chords be rewritten?
          </Text>
          <HStack gap={2} wrap="wrap">
            <Button size="xs" colorPalette="brand" onClick={convert.convertChart}>
              Transpose the chart to {targetKey}
            </Button>
            <Button size="xs" variant="outline" onClick={convert.relabelOnly}>
              It was already in {targetKey} — just fix the label
            </Button>
          </HStack>
        </Box>
      )}

      {convert.undo && (
        <Box p={3} bg="green.50" borderRadius="md" borderLeftWidth="3px" borderColor="green.400">
          <HStack gap={3} wrap="wrap">
            <Text fontSize="sm">
              Chart transposed from <strong>{convert.undo.key}</strong> to{' '}
              <strong>{convert.contentKey}</strong>. Nothing is written until you save.
            </Text>
            <Button size="xs" variant="outline" onClick={convert.undoConvert}>
              Undo
            </Button>
          </HStack>
        </Box>
      )}
    </>
  );
}

/** The chart editor: ChordPro-ish source with a live preview — beside it, or
 *  below it when the full editing width is preferred — with the align-chords
 *  conversion and its undo. */
export default function ChartEditorPanels({
  content,
  songKey,
  noteCards,
  onContentChange,
  chartColumns = 1,
}: {
  content: string;
  /** The key the chart is being written in — '' when not set. */
  songKey: string;
  noteCards: NoteCard[];
  onContentChange: (content: string) => void;
  /** Columns the preview renders in, mirroring the saved chart setting. */
  chartColumns?: number;
}) {
  // Content as it was before chords were lifted above the lyrics, so a
  // conversion that lands badly can be taken back before it's saved.
  const [preAlign, setPreAlign] = useState<string | null>(null);
  const [layout, setLayout] = useState<EditorLayout>(storedLayout);

  const toggleLayout = () => {
    const next: EditorLayout = layout === 'side' ? 'stacked' : 'side';
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Preference simply won't stick without storage.
    }
  };

  const alignChords = () => {
    setPreAlign(content);
    onContentChange(toAligned(content));
  };

  const undoAlign = () => {
    if (preAlign === null) return;
    onContentChange(preAlign);
    setPreAlign(null);
  };

  const previewNotes = groupNotes(noteCards);

  return (
    <Grid templateColumns={layout === 'side' ? { base: '1fr', lg: '1fr 1fr' } : '1fr'} gap={4}>
      <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
        <Flex justify="space-between" align="center" gap={2} mb={1} wrap="wrap">
          <Text fontWeight="medium">Lyrics &amp; chords</Text>
          <HStack gap={2}>
            {preAlign !== null && (
              <Button size="xs" variant="ghost" onClick={undoAlign}>
                Undo
              </Button>
            )}
            {hasInlineChords(content) && (
              <Button size="xs" variant="outline" onClick={alignChords}>
                Move chords above the lyrics
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              onClick={toggleLayout}
              title={
                layout === 'side'
                  ? 'Full-width editor, preview below'
                  : 'Editor and preview side by side'
              }
            >
              {layout === 'side' ? <Rows2 size={14} /> : <Columns2 size={14} />}
            </Button>
          </HStack>
        </Flex>
        <Text fontSize="xs" color="gray.600" mb={3}>
          Write chords on their own line above the lyric — each one lands on whatever it sits
          over. Inline <code>[G]Amazing</code> still works, and the two can be mixed. Mark
          sections with <code>{'{Verse 1}'}</code>, and wrap a cue in asterisks —{' '}
          <code>*hold*</code> — to show it in red anywhere on a chord row, in a lyric, or on a
          line of its own. Start a line with <code>##</code> for big text (<code>###</code> for
          slightly smaller); a single <code>#</code> is a hidden comment.{' '}
          {songKey ? (
            <>
              Write in the key of <strong>{songKey}</strong> — everyone can transpose from there.
            </>
          ) : (
            <>
              Set the key above once you know it — until then the chart shows as written and
              nobody can transpose it.
            </>
          )}
        </Text>
        <Textarea
          className="chart-source"
          value={content}
          spellCheck={false}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={22}
          fontSize="14px"
        />
      </Box>

      <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
        <Text fontWeight="medium" mb={3}>
          Preview
        </Text>
        {content.trim() || noteCards.length ? (
          <>
            <NoteCardList cards={previewNotes.general} />
            <Box mt={previewNotes.general.length ? 3 : 0}>
              <ChordChart
                content={content}
                fromKey={songKey}
                toKey={songKey}
                sectionNotes={previewNotes.bySection}
                columns={chartColumns}
              />
            </Box>
          </>
        ) : (
          <Text color="gray.500" fontSize="sm">
            Your chart appears here as you type.
          </Text>
        )}
      </Box>
    </Grid>
  );
}

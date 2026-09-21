import { Box, Button, Flex, HStack, Popover, Portal, Stack, Text } from '@chakra-ui/react';
import { Minus, Plus, Settings2 } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { FONTS } from '@/lib/fonts';
import { MAX_CHART_FONT, MIN_CHART_FONT, useChartFontSize } from '@/lib/useChartFontSize';
import { useEditorV2 } from '@/lib/useEditorV2';
import { Select } from '@/components/FormControls';

/**
 * How charts are shown on this device — one popover in the header for the
 * three settings that apply to every chart in the app: the format (classic
 * or new), the text size, and the font. Each is remembered on the device.
 */
export default function DisplaySettings() {
  const { font, setFont } = useApp();
  const [size, step] = useChartFontSize();
  const [v2, setV2] = useEditorV2();

  return (
    <Popover.Root lazyMount unmountOnExit positioning={{ placement: 'bottom-end' }}>
      <Popover.Trigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Chart display settings"
          title="Chart display settings"
          color="rgba(248, 246, 242, 0.72)"
          _hover={{ bg: 'rgba(248, 246, 242, 0.16)', color: 'gray.50' }}
        >
          <Settings2 size={16} />
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="280px">
            <Popover.Arrow />
            <Popover.Body p={4}>
              <Stack gap={4}>
                <Text fontWeight="semibold" fontSize="sm">
                  Chart display
                </Text>

                <Box>
                  <Text fontSize="xs" fontWeight="medium" color="gray.600" mb={1.5}>
                    Format
                  </Text>
                  <HStack gap={0} borderWidth="1px" borderRadius="md" overflow="hidden">
                    <Button
                      size="sm"
                      flex="1"
                      borderRadius={0}
                      variant={v2 ? 'ghost' : 'solid'}
                      colorPalette={v2 ? 'gray' : 'brand'}
                      onClick={() => setV2(false)}
                      aria-pressed={!v2}
                    >
                      Classic
                    </Button>
                    <Button
                      size="sm"
                      flex="1"
                      borderRadius={0}
                      variant={v2 ? 'solid' : 'ghost'}
                      colorPalette={v2 ? 'brand' : 'gray'}
                      onClick={() => setV2(true)}
                      aria-pressed={v2}
                    >
                      New
                    </Button>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" mt={1.5}>
                    {v2
                      ? 'Plain text, shown exactly as typed. Every chart and editor.'
                      : 'ChordPro charts with inline chords and note cards.'}
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="xs" fontWeight="medium" color="gray.600" mb={1.5}>
                    Text size
                  </Text>
                  <Flex align="center" gap={2}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => step(-1)}
                      disabled={size <= MIN_CHART_FONT}
                      aria-label="Smaller chart text"
                    >
                      <Minus size={14} />
                    </Button>
                    <Text
                      flex="1"
                      textAlign="center"
                      fontSize="sm"
                      fontVariantNumeric="tabular-nums"
                    >
                      {size}px
                    </Text>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => step(1)}
                      disabled={size >= MAX_CHART_FONT}
                      aria-label="Larger chart text"
                    >
                      <Plus size={14} />
                    </Button>
                  </Flex>
                </Box>

                <Box>
                  <Text fontSize="xs" fontWeight="medium" color="gray.600" mb={1.5}>
                    Font
                  </Text>
                  <Select
                    value={font.id}
                    onChange={setFont}
                    options={FONTS.map((f) => ({ value: f.id, label: f.label }))}
                    aria-label="Chart font"
                    size="sm"
                  />
                </Box>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

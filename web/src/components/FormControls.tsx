import { Box, Portal, Select as ChakraSelect, Text, createListCollection } from '@chakra-ui/react';
import type { SelectTriggerProps } from '@chakra-ui/react';
import { useMemo } from 'react';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

/** An option: a bare string doubles as its own label; an object separates the
 *  two ("1" shown as "1 column"). */
export type SelectOption = string | { value: string; label: string };

/** The two chart layouts, for the song and setlist-item editors. */
export const CHART_LAYOUTS = [
  { value: '1', label: '1 column' },
  { value: '2', label: '2 columns' },
];

/** Capo 0–11 as select options; callers relabel 0 ("None", "No capo") as
 *  suits the sentence around it. */
export const CAPO_OPTIONS = Array.from({ length: 12 }, (_, n) => ({
  value: String(n),
  label: n === 0 ? 'None' : String(n),
}));

/** Ark rejects '' as a selectable value, so the blank option travels under
 *  this name and is swapped back before it reaches the caller. */
const NONE = '__none__';

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  /** Label for the '' option, when blank needs to read as more than a dash. */
  emptyLabel?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Width of the whole control. Defaults to filling its container. */
  width?: string | number;
  minW?: string | number;
  title?: string;
  'aria-label'?: string;
  /** Styles for the trigger alone — the header uses this to sit on its dark
   *  band, the key pickers to set the chord name in bold. */
  triggerProps?: SelectTriggerProps;
}

/**
 * The app's one dropdown, on Chakra's Select rather than the native element:
 * it looks the same on every platform and its list can be styled, where the
 * native one is drawn by the OS and ignores everything but font.
 */
export function Select({
  value,
  onChange,
  options,
  emptyLabel = '—',
  size = 'md',
  disabled,
  width = '100%',
  minW,
  title,
  'aria-label': ariaLabel,
  triggerProps,
}: SelectProps) {
  const collection = useMemo(
    () =>
      createListCollection({
        items: options.map((opt) => {
          const { value: v, label } = typeof opt === 'string' ? { value: opt, label: opt } : opt;
          return { value: v === '' ? NONE : v, label: v === '' ? emptyLabel : label };
        }),
      }),
    [options, emptyLabel],
  );

  return (
    <ChakraSelect.Root
      collection={collection}
      value={[value === '' ? NONE : value]}
      onValueChange={(e) => onChange(e.value[0] === NONE ? '' : (e.value[0] ?? ''))}
      size={size}
      disabled={disabled}
      width={width}
      minW={minW}
      positioning={{ sameWidth: false }}
    >
      <ChakraSelect.HiddenSelect aria-label={ariaLabel} />
      <ChakraSelect.Control>
        <ChakraSelect.Trigger title={title} bg="white" cursor="pointer" {...triggerProps}>
          <ChakraSelect.ValueText />
        </ChakraSelect.Trigger>
        <ChakraSelect.IndicatorGroup>
          <ChakraSelect.Indicator />
        </ChakraSelect.IndicatorGroup>
      </ChakraSelect.Control>
      <Portal>
        <ChakraSelect.Positioner>
          {/* Scrolls (a key list runs long on a phone) without drawing a
              scrollbar — the list is the whole width of its card, and a
              bar down its edge reads as clutter next to the check marks. */}
          <ChakraSelect.Content
            zIndex="popover"
            css={{
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {collection.items.map((item) => (
              <ChakraSelect.Item item={item} key={item.value}>
                {item.label}
                <ChakraSelect.ItemIndicator />
              </ChakraSelect.Item>
            ))}
          </ChakraSelect.Content>
        </ChakraSelect.Positioner>
      </Portal>
    </ChakraSelect.Root>
  );
}

import { Box, Button, HStack, Input, NativeSelect, Stack, Textarea } from '@chakra-ui/react';
import { useState } from 'react';
import type { Category } from '@/types';

export interface PrayerDraft {
  title: string;
  details: string;
  /** '' means uncategorized. */
  categoryId: string;
}

/** Add and edit share this form. The caller owns saving and errors. */
export default function PrayerForm({
  categories,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  categories: Category[];
  initial?: PrayerDraft;
  submitLabel: string;
  onSubmit: (draft: PrayerDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PrayerDraft>(initial ?? { title: '', details: '', categoryId: '' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box bg="white" p={4} borderRadius="lg" borderWidth="1px" borderColor="brand.200">
      <Stack gap={3}>
        <Input
          placeholder="What are we praying for?"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          autoFocus
        />
        <NativeSelect.Root>
          <NativeSelect.Field
            value={draft.categoryId}
            onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Textarea
          placeholder="Details (optional)"
          value={draft.details}
          onChange={(e) => setDraft({ ...draft, details: e.target.value })}
          rows={3}
        />
        <HStack justify="flex-end">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button colorPalette="brand" onClick={submit} loading={saving} disabled={!draft.title.trim()}>
            {submitLabel}
          </Button>
        </HStack>
      </Stack>
    </Box>
  );
}

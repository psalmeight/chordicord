import { Box, Button, Checkbox, Flex, HStack, Heading, Spinner, Stack, Text } from '@chakra-ui/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { canManage } from '@/lib/auth';
import { useApp } from '@/contexts/AppContext';
import PrayerForm, { type PrayerDraft } from '@/components/PrayerForm';
import type { Category, Prayer } from '@/types';

/** 'all', 'none' (uncategorized) or a category id. */
type Filter = string;

// Per-viewer conveniences, kept in this browser only. Storage can be missing
// or throw (private mode, blocked site data), so every access is guarded and
// the page works the same without it.
const FILTER_KEY = 'pray.filter';
const doneKey = (userId: string) => `pray.done.${userId}`;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
}

/** Local calendar day, so ticks reset at the viewer's midnight. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Today's ticked prayer ids; yesterday's list comes back empty. */
function loadDone(userId: string): Set<string> {
  try {
    const saved = JSON.parse(load(doneKey(userId)) ?? 'null');
    if (saved?.date === today() && Array.isArray(saved.ids)) return new Set(saved.ids);
  } catch {
    // Unreadable; start the day fresh.
  }
  return new Set();
}

export default function Prayers() {
  const { user } = useApp();
  const admin = canManage(user);
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilterState] = useState<Filter>(() => load(FILTER_KEY) ?? 'all');
  const [done, setDone] = useState<Set<string>>(() => (user ? loadDone(user.id) : new Set()));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<Prayer[]>('/api/prayer/prayers'), api.get<Category[]>('/api/prayer/categories')])
      .then(([p, c]) => {
        setPrayers(p.data);
        setCategories(c.data);
      })
      .catch((err) => setError(apiError(err, 'Could not load prayers')))
      .finally(() => setLoading(false));
  }, []);

  const setFilter = (value: Filter) => {
    setFilterState(value);
    save(FILTER_KEY, value);
  };

  const toggleDone = (id: string, checked: boolean) => {
    // Reload first so a list left open overnight doesn't carry yesterday's ticks.
    const next = user ? loadDone(user.id) : new Set(done);
    if (checked) next.add(id);
    else next.delete(id);
    setDone(next);
    if (user) save(doneKey(user.id), JSON.stringify({ date: today(), ids: [...next] }));
  };

  // A remembered category that has since been deleted falls back to All.
  useEffect(() => {
    if (!loading && filter !== 'all' && filter !== 'none' && !categories.some((c) => c.id === filter)) {
      setFilter('all');
    }
  }, [loading, categories, filter]);

  // One section per category that has prayers, in category order, then the
  // uncategorized ones. A filter narrows this to a single section.
  const sections = useMemo(() => {
    const byCategory = new Map<string | null, Prayer[]>();
    for (const p of prayers) {
      const list = byCategory.get(p.categoryId) ?? [];
      list.push(p);
      byCategory.set(p.categoryId, list);
    }
    const all = [
      ...categories.map((c) => ({ key: c.id, title: c.name, items: byCategory.get(c.id) ?? [] })),
      { key: 'none', title: 'Uncategorized', items: byCategory.get(null) ?? [] },
    ];
    return filter === 'all' ? all.filter((s) => s.items.length > 0) : all.filter((s) => s.key === filter);
  }, [prayers, categories, filter]);

  const hasUncategorized = prayers.some((p) => p.categoryId === null);

  const toBody = (d: PrayerDraft) => ({
    title: d.title.trim(),
    details: d.details,
    categoryId: d.categoryId || null,
  });

  const create = async (draft: PrayerDraft) => {
    try {
      const { data } = await api.post<Prayer>('/api/prayer/prayers', toBody(draft));
      setPrayers((prev) => [data, ...prev]);
      setAdding(false);
      setError('');
    } catch (err) {
      setError(apiError(err, 'Could not add prayer'));
    }
  };

  const update = async (id: string, draft: PrayerDraft) => {
    try {
      const body = { ...toBody(draft), clearCategory: !draft.categoryId };
      const { data } = await api.patch<Prayer>(`/api/prayer/prayers/${id}`, body);
      setPrayers((prev) => prev.map((p) => (p.id === id ? data : p)));
      setEditingId(null);
      setError('');
    } catch (err) {
      setError(apiError(err, 'Could not save prayer'));
    }
  };

  const remove = async (prayer: Prayer) => {
    if (!window.confirm(`Delete "${prayer.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/prayer/prayers/${prayer.id}`);
      setPrayers((prev) => prev.filter((p) => p.id !== prayer.id));
    } catch (err) {
      setError(apiError(err, 'Could not delete prayer'));
    }
  };

  const chip = (value: Filter, label: string) => (
    <Button
      key={value}
      size="xs"
      borderRadius="full"
      variant={filter === value ? 'solid' : 'outline'}
      colorPalette={filter === value ? 'brand' : 'gray'}
      onClick={() => setFilter(value)}
    >
      {label}
    </Button>
  );

  return (
    <Stack gap={5}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Heading size="lg">Prayer list</Heading>
        {admin && !adding && (
          <Button size="sm" colorPalette="brand" onClick={() => setAdding(true)}>
            <Plus size={16} />
            <Text ml={1}>New prayer</Text>
          </Button>
        )}
      </Flex>

      {adding && (
        <PrayerForm
          categories={categories}
          submitLabel="Add"
          initial={{ title: '', details: '', categoryId: filter === 'all' || filter === 'none' ? '' : filter }}
          onSubmit={create}
          onCancel={() => setAdding(false)}
        />
      )}

      {error && <Text color="red.600">{error}</Text>}

      {(categories.length > 0 || hasUncategorized) && (
        <HStack gap={2} wrap="wrap">
          {chip('all', 'All')}
          {categories.map((c) => chip(c.id, c.name))}
          {chip('none', 'Uncategorized')}
        </HStack>
      )}

      {loading ? (
        <Spinner />
      ) : sections.every((s) => s.items.length === 0) ? (
        <Box bg="white" p={8} borderRadius="lg" borderWidth="1px" textAlign="center">
          <Text color="gray.600">{prayers.length === 0 ? 'No prayers yet.' : 'Nothing here.'}</Text>
        </Box>
      ) : (
        <Stack gap={5}>
          {sections.map((section) => (
            <Box
              key={section.key}
              as="section"
              bg="white"
              borderRadius="xl"
              borderWidth="1px"
              overflow="hidden"
              boxShadow="xs"
            >
              <Flex
                align="center"
                justify="space-between"
                gap={3}
                px={5}
                py={3}
                bg="gray.50"
                borderBottomWidth="1px"
                borderTopWidth="3px"
                borderTopColor="brand.600"
              >
                <Heading as="h2" size="sm" color="gray.800">
                  {section.title}
                </Heading>
                <Text
                  fontSize="xs"
                  fontWeight="semibold"
                  color="brand.700"
                  bg="brand.50"
                  px={2}
                  py={0.5}
                  borderRadius="full"
                  flexShrink={0}
                >
                  {section.items.filter((p) => done.has(p.id)).length}/{section.items.length}
                </Text>
              </Flex>

              <Box as="ul" listStyleType="none" m={0} p={0}>
                {section.items.map((prayer) => (
                  <Box
                    as="li"
                    key={prayer.id}
                    px={5}
                    py={2.5}
                    borderTopWidth="1px"
                    borderColor="gray.100"
                    _first={{ borderTopWidth: 0 }}
                  >
                    {editingId === prayer.id ? (
                      <PrayerForm
                        categories={categories}
                        submitLabel="Save"
                        initial={{ title: prayer.title, details: prayer.details, categoryId: prayer.categoryId ?? '' }}
                        onSubmit={(d) => update(prayer.id, d)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <Flex gap={3} align="flex-start" opacity={done.has(prayer.id) ? 0.55 : 1}>
                        <Checkbox.Root
                          size="sm"
                          colorPalette="brand"
                          mt="2px"
                          flexShrink={0}
                          checked={done.has(prayer.id)}
                          onCheckedChange={(e) => toggleDone(prayer.id, e.checked === true)}
                          aria-label={`Prayed for ${prayer.title}`}
                        >
                          <Checkbox.HiddenInput />
                          <Checkbox.Control cursor="pointer" />
                        </Checkbox.Root>
                        <Box flex={1} minW={0}>
                          <Text
                            fontSize="sm"
                            fontWeight="medium"
                            color="gray.800"
                            textDecoration={done.has(prayer.id) ? 'line-through' : undefined}
                          >
                            {prayer.title}
                          </Text>
                          {prayer.details && (
                            <Text mt={0.5} fontSize="xs" color="gray.600" whiteSpace="pre-wrap" lineHeight="tall">
                              {prayer.details}
                            </Text>
                          )}
                        </Box>
                        {admin && (
                          <HStack gap={1} flexShrink={0}>
                            <Button
                              size="xs"
                              variant="ghost"
                              color="gray.500"
                              onClick={() => setEditingId(prayer.id)}
                              aria-label="Edit prayer"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              color="gray.500"
                              onClick={() => remove(prayer)}
                              aria-label="Delete prayer"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </HStack>
                        )}
                      </Flex>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

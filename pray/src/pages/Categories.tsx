import { Box, Button, Flex, HStack, Heading, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import type { Category } from '@/types';

/** Admin-only (see App). Deleting a category keeps its prayers, uncategorized. */
export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const sortByName = (list: Category[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  useEffect(() => {
    api
      .get<Category[]>('/api/prayer/categories')
      .then(({ data }) => setCategories(data))
      .catch((err) => setError(apiError(err, 'Could not load categories')))
      .finally(() => setLoading(false));
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const { data } = await api.post<Category>('/api/prayer/categories', { name: name.trim() });
      setCategories((prev) => sortByName([...prev, data]));
      setName('');
      setError('');
    } catch (err) {
      setError(apiError(err, 'Could not add category'));
    }
  };

  const rename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const { data } = await api.patch<Category>(`/api/prayer/categories/${id}`, { name: editName.trim() });
      setCategories((prev) => sortByName(prev.map((c) => (c.id === id ? data : c))));
      setEditingId(null);
      setError('');
    } catch (err) {
      setError(apiError(err, 'Could not rename category'));
    }
  };

  const remove = async (category: Category) => {
    if (!window.confirm(`Delete "${category.name}"? Its prayers stay on the list, uncategorized.`)) return;
    try {
      await api.delete(`/api/prayer/categories/${category.id}`);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
    } catch (err) {
      setError(apiError(err, 'Could not delete category'));
    }
  };

  return (
    <Stack gap={5}>
      <Heading size="lg">Categories</Heading>

      <Box bg="white" p={4} borderRadius="lg" borderWidth="1px">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <HStack gap={2}>
            <Input placeholder="e.g. Family, Missions, Healing" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" colorPalette="brand" disabled={!name.trim()}>
              <Plus size={16} />
              <Text ml={1}>Add</Text>
            </Button>
          </HStack>
        </form>
      </Box>

      {error && <Text color="red.600">{error}</Text>}

      {loading ? (
        <Spinner />
      ) : categories.length === 0 ? (
        <Box bg="white" p={8} borderRadius="lg" borderWidth="1px" textAlign="center">
          <Text color="gray.600">No categories yet. Prayers without one show as uncategorized.</Text>
        </Box>
      ) : (
        <Stack gap={2}>
          {categories.map((category) => (
            <Flex key={category.id} bg="white" borderRadius="lg" borderWidth="1px" p={3} pl={4} align="center" gap={3}>
              {editingId === category.id ? (
                <form
                  style={{ flex: 1, display: 'flex', gap: 8 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename(category.id);
                  }}
                >
                  <Input size="sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <Button type="submit" size="sm" colorPalette="brand" aria-label="Save" disabled={!editName.trim()}>
                    <Check size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Cancel" onClick={() => setEditingId(null)}>
                    <X size={14} />
                  </Button>
                </form>
              ) : (
                <>
                  <Text flex={1} fontWeight="semibold">
                    {category.name}
                  </Text>
                  <HStack gap={1}>
                    <Button
                      size="xs"
                      variant="ghost"
                      color="gray.500"
                      aria-label="Rename category"
                      title="Rename"
                      onClick={() => {
                        setEditingId(category.id);
                        setEditName(category.name);
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      color="gray.500"
                      aria-label="Delete category"
                      title="Delete"
                      onClick={() => remove(category)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </HStack>
                </>
              )}
            </Flex>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

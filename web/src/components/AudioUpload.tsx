import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import axios from 'axios';
import api, { apiError } from '@/lib/api';
import AudioLibraryDialog from './AudioLibraryDialog';

interface Props {
  songId: string;
  hasExisting: boolean;
  onUploaded: () => void;
}

/**
 * Uploads a reference MP3 straight to storage.
 *
 * The file never touches our API: Vercel caps serverless request bodies at
 * 4.5MB and MP3s routinely exceed that. The API only mints a signed URL and
 * records the result once the browser reports the PUT succeeded.
 */
export default function AudioUpload({ songId, hasExisting, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  // Set when the library is full, which turns the error into an actionable
  // "here's what you could delete" dialog rather than a dead end.
  const [atLimit, setAtLimit] = useState(false);

  const upload = async (file: File) => {
    setError('');
    setAtLimit(false);
    setProgress(0);

    try {
      const { data } = await api.post<{ uploadUrl: string }>(`/api/songs/${songId}/audio/upload-url`, {
        filename: file.name,
        size: file.size,
      });

      await axios.put(data.uploadUrl, file, {
        headers: { 'Content-Type': 'audio/mpeg' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });

      await api.post(`/api/songs/${songId}/audio`, { filename: file.name });
      setProgress(null);
      onUploaded();
    } catch (err) {
      setProgress(null);
      if (axios.isAxiosError(err) && err.response?.status === 409) setAtLimit(true);
      setError(apiError(err, 'Upload failed'));
    }
  };

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,.mp3"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so picking the same file twice still fires a change event.
          e.target.value = '';
          if (file) void upload(file);
        }}
      />

      <Flex align="center" gap={3} wrap="wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          loading={progress !== null}
          loadingText={`Uploading ${progress ?? 0}%`}
        >
          <Upload size={16} />
          <Text ml={2}>{hasExisting ? 'Replace track' : 'Attach MP3'}</Text>
        </Button>
        <Text fontSize="xs" color="gray.500">
          MP3 up to 20MB
        </Text>
      </Flex>

      {error && (
        <Text fontSize="sm" color="red.600" mt={2}>
          {error}
        </Text>
      )}

      {atLimit && (
        <Box mt={3}>
          <AudioLibraryDialog
            onChanged={() => {
              setAtLimit(false);
              setError('');
            }}
          />
        </Box>
      )}
    </Box>
  );
}

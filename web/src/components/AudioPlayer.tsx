import { Box, Button, Flex, HStack, Spinner, Text } from '@chakra-ui/react';
import { Minus, Music2, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { formatTime, useAudioPlayer } from '@/lib/useAudioPlayer';
import type { SongAudio } from '@/types';

interface Props {
  songId: string;
  canEdit: boolean;
  onRemoved: () => void;
}

/** Beyond this the artefacts swamp the reference — transpose the chart instead. */
const MAX_SHIFT = 6;

/**
 * Plays the attached reference track with its own pitch control.
 *
 * Deliberately not tied to the chart's key selector. The stored key describes
 * the chart, not the recording, and the two often disagree — a track cut in a
 * different key, or a tape running slightly sharp, would be shifted by a real
 * but wrong interval. Songs with no key set would get no control at all. So
 * this is a plain offset from whatever the recording actually is.
 */
export default function AudioPlayer({ songId, canEdit, onRemoved }: Props) {
  const [track, setTrack] = useState<SongAudio | null>(null);
  const [loadError, setLoadError] = useState('');
  const [removing, setRemoving] = useState(false);
  const [semitones, setSemitones] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const shiftBy = (delta: number) =>
    setSemitones((s) => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, s + delta)));

  useEffect(() => {
    let cancelled = false;
    api
      .get<SongAudio>(`/api/songs/${songId}/audio`)
      .then(({ data }) => !cancelled && setTrack(data))
      .catch((err) => !cancelled && setLoadError(apiError(err, 'Could not load the track')));
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const player = useAudioPlayer(track?.url ?? null, semitones);

  const remove = async () => {
    if (!window.confirm('Remove this track? It frees a slot in the library.')) return;
    setRemoving(true);
    try {
      await api.delete(`/api/songs/${songId}/audio`);
      player.stop();
      onRemoved();
    } catch (err) {
      setLoadError(apiError(err, 'Could not remove the track'));
      setRemoving(false);
    }
  };

  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    player.seek((e.clientX - rect.left) / rect.width);
  };

  if (loadError) return <Text color="red.600" fontSize="sm">{loadError}</Text>;
  if (!track) return <Spinner size="sm" />;

  const progress = player.duration ? (player.position / player.duration) * 100 : 0;
  const shiftLabel =
    semitones === 0
      ? 'Original pitch'
      : `${semitones > 0 ? '+' : ''}${semitones} ${Math.abs(semitones) === 1 ? 'semitone' : 'semitones'}`;

  return (
    <Box>
      <Flex align="center" gap={3} wrap="wrap">
        <Button
          size="sm"
          colorPalette="blue"
          onClick={player.toggle}
          disabled={player.status !== 'ready'}
          aria-label={player.playing ? 'Pause' : 'Play'}
        >
          {player.status === 'loading' ? (
            <Spinner size="xs" />
          ) : player.playing ? (
            <Pause size={16} />
          ) : (
            <Play size={16} />
          )}
        </Button>

        <Text fontSize="sm" color="gray.600" minW="90px" fontVariantNumeric="tabular-nums">
          {formatTime(player.position)} / {formatTime(player.duration)}
        </Text>

        <Box
          ref={barRef}
          flex="1"
          minW="140px"
          h="6px"
          bg="gray.200"
          borderRadius="full"
          cursor={player.status === 'ready' ? 'pointer' : 'default'}
          onClick={player.status === 'ready' ? scrub : undefined}
        >
          <Box h="100%" w={`${progress}%`} bg="blue.500" borderRadius="full" />
        </Box>

        <HStack gap={1}>
          <Music2 size={14} />
          <Button
            size="xs"
            variant="outline"
            onClick={() => shiftBy(-1)}
            disabled={semitones <= -MAX_SHIFT}
            aria-label="Pitch down a semitone"
          >
            <Minus size={12} />
          </Button>
          <Text
            fontSize="sm"
            color={semitones === 0 ? 'gray.600' : 'blue.600'}
            fontWeight="medium"
            minW="105px"
            textAlign="center"
            fontVariantNumeric="tabular-nums"
          >
            {shiftLabel}
          </Text>
          <Button
            size="xs"
            variant="outline"
            onClick={() => shiftBy(1)}
            disabled={semitones >= MAX_SHIFT}
            aria-label="Pitch up a semitone"
          >
            <Plus size={12} />
          </Button>
          {semitones !== 0 && (
            <Button size="xs" variant="ghost" onClick={() => setSemitones(0)} aria-label="Back to original pitch">
              <RotateCcw size={12} />
            </Button>
          )}
        </HStack>

        {canEdit && (
          <Button size="xs" variant="ghost" colorPalette="red" onClick={remove} loading={removing}>
            <Trash2 size={14} />
          </Button>
        )}
      </Flex>

      {player.status === 'loading' && (
        <Text fontSize="xs" color="gray.500" mt={2}>
          Decoding the track — pitch shifting needs the whole file in memory, so this takes a moment.
        </Text>
      )}
      {player.status === 'error' && (
        <Text fontSize="sm" color="red.600" mt={2}>
          {player.error}
        </Text>
      )}
      {Math.abs(semitones) >= 5 && player.status === 'ready' && (
        <Text fontSize="xs" color="orange.600" mt={2}>
          Large shifts get artefacty — fine as a guide, rough as a reference.
        </Text>
      )}
    </Box>
  );
}

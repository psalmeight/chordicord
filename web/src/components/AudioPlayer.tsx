import { Box, Button, Flex, HStack, Spinner, Text } from '@chakra-ui/react';
import { Link2, Link2Off, Minus, Music2, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { formatTime, useAudioPlayer } from '@/lib/useAudioPlayer';
import type { SongAudio } from '@/types';

interface Props {
  songId: string;
  canEdit: boolean;
  /** When provided (and canEdit), a remove control is shown. */
  onRemoved?: () => void;
  /**
   * Baseline saved tune, in semitones. Provide it in a setlist, where the tune
   * comes from the item (or the recording's default). Omit it on a song page —
   * the player then adopts the recording's own saved tune once it loads.
   */
  tuneOverride?: number;
  /** When provided (and canEdit), tune changes save themselves, debounced. */
  onSaveTune?: (semitones: number) => Promise<void>;
  /**
   * Render as a thin strip and defer the signed-URL fetch and full decode
   * until the first Play press. Setlists mount one player per song, and every
   * track is decoded whole into memory — eager loading would fetch them all.
   */
  lazy?: boolean;
  /**
   * When provided, a link toggle appears beside the pitch controls. While
   * linked, every pitch step reports its delta here so the caller can move
   * the chart key in step with the track. It starts linked, since pitching a
   * track up almost always means playing it in the new key — but it is never a
   * hard tie: unlink it, and the key stays independently editable either way.
   */
  onPitchDelta?: (delta: number) => void;
}

/** Beyond this the artefacts swamp the reference — transpose the chart instead. */
const MAX_SHIFT = 6;

const clampShift = (n: number) => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, n));

/**
 * Plays the attached reference track with its own saved pitch control.
 *
 * The offset is deliberately independent of the chart's key selector: the
 * stored key describes the chart, not the recording, and the two often
 * disagree — a track cut in a different key, or a tape running slightly sharp,
 * would be shifted by a real but wrong interval. So this is a plain offset from
 * whatever the recording actually is. Unlike the chart controls it *is*
 * persisted (per recording, or per setlist item) so the whole team plays along
 * at the same pitch.
 */
export default function AudioPlayer({
  songId, canEdit, onRemoved, tuneOverride, onSaveTune, lazy, onPitchDelta,
}: Props) {
  const [track, setTrack] = useState<SongAudio | null>(null);
  // A lazy player waits for a click before touching the network; the click
  // also queues an auto-play so one press both loads and starts the track.
  const [activated, setActivated] = useState(!lazy);
  const autoPlay = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [removing, setRemoving] = useState(false);
  const [semitones, setSemitones] = useState(clampShift(tuneOverride ?? 0));
  // The persisted baseline, so we can tell when there's an unsaved change.
  const [saved, setSaved] = useState(clampShift(tuneOverride ?? 0));
  // In a setlist the baseline is given; on a song page we adopt it from the
  // recording once, on load, without clobbering a mid-session adjustment.
  const tuneInitialised = useRef(tuneOverride !== undefined);
  const [savingTune, setSavingTune] = useState(false);
  const [tuneError, setTuneError] = useState('');
  // Whether pitch steps also move the chart key, via onPitchDelta. On by
  // default: pitching the track is nearly always a decision about what key to
  // play in, so following is the expected behaviour and unlinking the exception.
  const [linked, setLinked] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  const canSaveTune = canEdit && Boolean(onSaveTune);

  const shiftBy = (delta: number) => {
    const next = clampShift(semitones + delta);
    if (next === semitones) return;
    if (linked) onPitchDelta?.(next - semitones);
    setSemitones(next);
  };

  const resetPitch = () => {
    if (linked) onPitchDelta?.(-semitones);
    setSemitones(0);
  };

  useEffect(() => {
    if (!activated) return;
    let cancelled = false;
    api
      .get<SongAudio>(`/api/songs/${songId}/audio`)
      .then(({ data }) => {
        if (cancelled) return;
        setTrack(data);
        if (!tuneInitialised.current) {
          setSemitones(clampShift(data.tuneOffset));
          setSaved(clampShift(data.tuneOffset));
          tuneInitialised.current = true;
        }
      })
      .catch((err) => !cancelled && setLoadError(apiError(err, 'Could not load the track')));
    return () => {
      cancelled = true;
    };
  }, [songId, activated]);

  const player = useAudioPlayer(track?.url ?? null, semitones);

  // The activating click promised playback; deliver it as soon as the track is
  // decoded. Autoplay policy allows it — the load began with a user gesture.
  useEffect(() => {
    if (autoPlay.current && player.status === 'ready') {
      autoPlay.current = false;
      player.toggle();
    }
  }, [player.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    if (!onRemoved) return;
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

  // Tune changes save themselves. The pitch is found by ear, a semitone at a
  // time, and a separate Save press was easy to walk away from — leaving the
  // team playing along at a pitch nobody had actually stored. Debounced so a
  // run of +/- presses lands as a single write.
  const saveTuneRef = useRef(onSaveTune);
  saveTuneRef.current = onSaveTune;
  // The value a scheduled save is carrying, so unmounting mid-debounce (hiding
  // the player, leaving the page) flushes it instead of dropping it.
  const pendingTune = useRef<number | null>(null);

  useEffect(() => {
    // Back on the stored pitch — nothing owed, so drop any pending flush too,
    // or stepping up and straight back down would still write the step.
    if (!canSaveTune || semitones === saved) {
      pendingTune.current = null;
      return;
    }
    pendingTune.current = semitones;
    const value = semitones;
    const timer = setTimeout(() => {
      setSavingTune(true);
      setTuneError('');
      saveTuneRef
        .current!(value)
        .then(() => setSaved(value))
        .catch((err) => setTuneError(apiError(err, 'Could not save the tune')))
        .finally(() => setSavingTune(false));
    }, 700);
    return () => clearTimeout(timer);
  }, [semitones, saved, canSaveTune]);

  useEffect(
    () => () => {
      if (pendingTune.current !== null) saveTuneRef.current?.(pendingTune.current).catch(() => {});
    },
    [],
  );

  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    player.seek((e.clientX - rect.left) / rect.width);
  };

  if (loadError) return <Text color="red.600" fontSize="sm">{loadError}</Text>;

  if (!activated) {
    return (
      <Flex align="center" gap={2}>
        <Button
          size="xs"
          variant="outline"
          colorPalette="brand"
          onClick={() => {
            autoPlay.current = true;
            setActivated(true);
          }}
          aria-label="Play along"
        >
          <Play size={14} />
        </Button>
        <Music2 size={14} />
        <Text fontSize="sm" color="gray.600">
          Play along
        </Text>
      </Flex>
    );
  }

  if (!track) return <Spinner size="sm" />;

  const progress = player.duration ? (player.position / player.duration) * 100 : 0;
  const shiftLabel =
    semitones === 0
      ? 'Original pitch'
      : `${semitones > 0 ? '+' : ''}${semitones} ${Math.abs(semitones) === 1 ? 'semitone' : 'semitones'}`;
  const dirty = canSaveTune && semitones !== saved;

  return (
    <Box>
      <Flex align="center" gap={3} wrap="wrap">
        <Button
          size="sm"
          colorPalette="brand"
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
          <Box h="100%" w={`${progress}%`} bg="brand.500" borderRadius="full" />
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
            color={semitones === 0 ? 'gray.600' : 'brand.600'}
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
            <Button size="xs" variant="ghost" onClick={resetPitch} aria-label="Back to original pitch">
              <RotateCcw size={12} />
            </Button>
          )}
          {onPitchDelta && (
            <Button
              size="xs"
              variant={linked ? 'subtle' : 'ghost'}
              colorPalette={linked ? 'brand' : 'gray'}
              onClick={() => setLinked((v) => !v)}
              title={
                linked
                  ? 'Chart key follows pitch changes — click to unlink'
                  : 'Link the chart key to pitch changes: +1 semitone also moves the chords up one'
              }
              aria-label={linked ? 'Unlink chart key from pitch' : 'Link chart key to pitch'}
            >
              {linked ? <Link2 size={12} /> : <Link2Off size={12} />}
            </Button>
          )}
          {(dirty || savingTune) && (
            <Text fontSize="xs" color="gray.500" minW="52px">
              Saving…
            </Text>
          )}
        </HStack>

        {canEdit && onRemoved && (
          <Button size="xs" variant="ghost" colorPalette="red" onClick={remove} loading={removing}>
            <Trash2 size={14} />
          </Button>
        )}
      </Flex>

      {tuneError && (
        <Text fontSize="sm" color="red.600" mt={2}>
          {tuneError}
        </Text>
      )}
      {canSaveTune && !dirty && !savingTune && saved !== 0 && (
        <Text fontSize="xs" color="gray.500" mt={2}>
          Saved tune: {saved > 0 ? '+' : ''}{saved} — everyone plays along at this pitch.
        </Text>
      )}
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

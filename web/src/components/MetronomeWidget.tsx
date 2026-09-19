import { Box, Button, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import { Gauge, Minus, Pause, Play, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Select } from '@/components/FormControls';
import StepButton from '@/components/StepButton';
import { MAX_BPM, MIN_BPM, useMetronome } from '@/contexts/MetronomeContext';

const BEAT_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
// A run of taps more than two seconds apart is a new count-in, not the same one.
const TAP_RESET_MS = 2000;

export default function MetronomeWidget() {
  const {
    bpm, setBpm, stepBpm, beatsPerBar, setBeatsPerBar,
    playing, currentBeat, tick, start, stop, open, setOpen, editing,
  } = useMetronome();

  const tapsRef = useRef<number[]>([]);

  // A brief on/off pulse fired on each beat, so the button and panel flash in
  // time. Keyed off the monotonic tick so a single-beat bar flashes too.
  const [flash, setFlash] = useState(false);
  const accent = currentBeat === 0;
  useEffect(() => {
    if (!playing) {
      setFlash(false);
      return;
    }
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 90);
    return () => window.clearTimeout(id);
  }, [tick, playing]);

  const tap = () => {
    const now = performance.now();
    const taps = tapsRef.current;
    if (taps.length && now - taps[taps.length - 1] > TAP_RESET_MS) taps.length = 0;
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      setBpm(60000 / (sum / (taps.length - 1)));
    }
  };

  // Off screen while a song is being edited — the editor's action bar owns
  // the bottom edge there, and a metronome isn't what you reach for mid-edit.
  if (editing) return null;

  return (
    <Box position="fixed" bottom="20px" right="20px" zIndex={1400} className="no-print">
      {open && (
        <Box
          bg="white"
          borderWidth="1px"
          borderRadius="xl"
          boxShadow="lg"
          p={4}
          mb={3}
          w="270px"
        >
          <Flex justify="space-between" align="center" mb={3}>
            <Text fontWeight="semibold">Metronome</Text>
            <Button size="xs" variant="ghost" onClick={() => setOpen(false)} aria-label="Close metronome">
              <X size={16} />
            </Button>
          </Flex>

          <Box
            borderRadius="lg"
            py={2}
            mb={2}
            transition="background 70ms ease-out"
            bg={playing && flash ? (accent ? 'brand.300' : 'brand.100') : 'gray.50'}
          >
            <Flex align="center" justify="center" gap={1}>
              <Text fontSize="4xl" fontWeight="bold" fontVariantNumeric="tabular-nums" lineHeight="1">
                {bpm}
              </Text>
              <Text fontSize="sm" color="gray.500" mb={1}>
                BPM
              </Text>
            </Flex>
          </Box>

          {/* Beat indicator */}
          <HStack justify="center" gap={2} mb={3} h="14px">
            {Array.from({ length: beatsPerBar }, (_, i) => (
              <Box
                key={i}
                w="10px"
                h="10px"
                borderRadius="full"
                bg={currentBeat === i ? (i === 0 ? 'brand.500' : 'brand.300') : 'gray.200'}
                transition="background 60ms"
              />
            ))}
          </HStack>

          <HStack gap={2} mb={3}>
            <Button size="sm" variant="outline" onClick={() => setBpm(bpm - 1)} aria-label="Slower">
              <Minus size={14} />
            </Button>
            <input
              type="range"
              min={MIN_BPM}
              max={MAX_BPM}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Tempo"
            />
            <Button size="sm" variant="outline" onClick={() => setBpm(bpm + 1)} aria-label="Faster">
              <Plus size={14} />
            </Button>
          </HStack>

          <Flex gap={2} align="center" mb={3}>
            <Text fontSize="sm" color="gray.600">
              Beats
            </Text>
            <Select
              value={String(beatsPerBar)}
              onChange={(v) => setBeatsPerBar(Number(v))}
              options={BEAT_OPTIONS.map(String)}
              aria-label="Beats per bar"
              size="sm"
              width="72px"
            />
            <Button size="sm" variant="outline" flex="1" onClick={tap}>
              Tap tempo
            </Button>
          </Flex>

          <Button
            w="100%"
            colorPalette={playing ? 'red' : 'brand'}
            onClick={() => (playing ? stop() : start())}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
            <Text ml={2}>{playing ? 'Stop' : 'Start'}</Text>
          </Button>
        </Box>
      )}

      {/* While it plays, the tempo is a thumb-tap away without opening the
          panel: faster on top, slower beneath, the live bpm between them —
          the button itself is icon-only, so this is the only readout. */}
      {playing && !open && (
        <Stack gap={2} mb={2} align="flex-end">
          <StepButton onStep={() => stepBpm(1)} label="Faster">
            <Plus size={22} />
          </StepButton>
          <Flex
            align="center"
            justify="center"
            w="48px"
            h="28px"
            borderRadius="full"
            bg="white"
            borderWidth="1px"
            borderColor="gray.200"
            boxShadow="0 1px 3px rgba(0,0,0,0.2)"
            fontSize="sm"
            fontWeight="bold"
            fontVariantNumeric="tabular-nums"
            aria-label="Tempo"
          >
            {bpm}
          </Flex>
          <StepButton onStep={() => stepBpm(-1)} label="Slower">
            <Minus size={22} />
          </StepButton>
        </Stack>
      )}

      {/* Icon only, always 52px round: the chart guide's button sits directly
          to its left and relies on this never growing into it. */}
      <Flex justify="flex-end">
        <Button
          borderRadius="full"
          h="52px"
          w="52px"
          px={0}
          colorPalette={playing ? 'green' : 'brand'}
          onClick={() => setOpen(!open)}
          aria-label="Metronome"
          title="Metronome"
          style={{
            transform: flash ? 'scale(1.14)' : 'scale(1)',
            boxShadow: flash
              ? `0 0 0 ${accent ? 9 : 6}px rgba(37, 99, 235, ${accent ? 0.5 : 0.35})`
              : '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'transform 70ms ease-out, box-shadow 70ms ease-out',
          }}
        >
          <Gauge size={20} />
        </Button>
      </Flex>
    </Box>
  );
}

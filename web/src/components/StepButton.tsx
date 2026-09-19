import { Button } from '@chakra-ui/react';
import type { ButtonProps } from '@chakra-ui/react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** Holding the button this long starts it repeating… */
const HOLD_DELAY_MS = 400;
/** …at this rate, until the finger lifts. */
const REPEAT_MS = 80;

/**
 * A big round nudge button for the floating widgets: one step per tap, and a
 * press-and-hold keeps stepping so a fine step size (0.1 of scroll speed, one
 * bpm) never means twenty taps. Sized for a thumb on a music stand.
 *
 * `onStep` is called repeatedly from a timer, so it must read fresh state —
 * a functional setState, not a value captured when the button rendered.
 *
 * Styled as a white circle by default; any Button prop passed in overrides
 * that, so a widget can fuse two of them into a coloured group.
 */
export default function StepButton({
  onStep,
  label,
  children,
  ...rest
}: {
  onStep: () => void;
  label: string;
  children: ReactNode;
} & ButtonProps) {
  const delayRef = useRef<number>(0);
  const repeatRef = useRef<number>(0);

  const stop = () => {
    window.clearTimeout(delayRef.current);
    window.clearInterval(repeatRef.current);
  };
  useEffect(() => stop, []);

  const press = () => {
    stop();
    onStep();
    delayRef.current = window.setTimeout(() => {
      repeatRef.current = window.setInterval(onStep, REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  return (
    <Button
      borderRadius="full"
      h="48px"
      w="48px"
      minW="48px"
      p={0}
      bg="white"
      color="gray.800"
      borderWidth="1px"
      borderColor="gray.200"
      boxShadow="0 1px 3px rgba(0,0,0,0.2)"
      _hover={{ bg: 'gray.50' }}
      _active={{ bg: 'gray.100' }}
      aria-label={label}
      title={label}
      onPointerDown={press}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // A long press must not become a text-selection or context-menu gesture.
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      {...rest}
    >
      {children}
    </Button>
  );
}

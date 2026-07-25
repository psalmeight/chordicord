import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

/**
 * Chakra sets fonts.body/heading on the document itself, which would win over
 * our stylesheet. Pointing its tokens at --app-font keeps the shell on one
 * font; .chart overrides its own subtree with --chart-font from there.
 */
const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        body: { value: 'var(--app-font)' },
        heading: { value: 'var(--app-font)' },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);

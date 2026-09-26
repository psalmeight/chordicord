import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

/**
 * Palette lifted from the FCF Tagbilaran site: warm paper neutrals for the
 * light surfaces, cool near-black navy for the dark chrome, brick red as the
 * accent and gold for highlights on dark. Chakra's own `gray` and `white`
 * tokens are overwritten rather than shadowed by a new scale, so every
 * existing `bg="white"` / `color="gray.600"` in the app picks the theme up
 * without being rewritten.
 */
const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        /* Chakra sets fonts.body/heading on the document itself, which would
           win over our stylesheet. Pointing its tokens at --app-font keeps the
           shell on one font; .chart overrides its own subtree with
           --chart-font from there. */
        body: { value: 'var(--app-font)' },
        heading: { value: 'var(--app-font)' },
      },
      colors: {
        /* Paper, not pure white — every card and panel in the app reads as
           the off-white stock the FCF site prints on. */
        white: { value: '#fdfcfa' },

        gray: {
          50: { value: '#f8f6f2' },
          100: { value: '#ece7de' },
          200: { value: '#e4ded3' },
          300: { value: '#dfd8cc' },
          400: { value: '#b3a99b' },
          500: { value: '#7b7268' },
          600: { value: '#5d564e' },
          700: { value: '#443e37' },
          800: { value: '#182231' },
          900: { value: '#141a22' },
          950: { value: '#0b1017' },
        },

        /* Brick. 600 is the site's --brick, 500 its hover tint, so a solid
           button darkens on hover the same way the marketing buttons do. */
        brand: {
          50: { value: '#fbf1ef' },
          100: { value: '#f4ddd9' },
          200: { value: '#e8bab3' },
          300: { value: '#d9928a' },
          400: { value: '#c26a5f' },
          500: { value: '#a8443a' },
          600: { value: '#8f3a30' },
          700: { value: '#742f27' },
          800: { value: '#5b2620' },
          900: { value: '#481e19' },
          950: { value: '#2b1210' },
        },

        /* Gold, used the way the site uses it: eyebrows and small marks on
           dark panels, never as a fill behind body text. */
        gold: {
          50: { value: '#fbf5e9' },
          100: { value: '#f5e7c8' },
          200: { value: '#ebd29a' },
          300: { value: '#dfba6d' },
          400: { value: '#d3a24c' },
          500: { value: '#c08c36' },
          600: { value: '#9d702b' },
          700: { value: '#785524' },
          800: { value: '#5b411f' },
          900: { value: '#43301a' },
          950: { value: '#261a0d' },
        },
      },
    },

    semanticTokens: {
      colors: {
        /* The recipe hooks Chakra reads for `colorPalette="brand"` — without
           these a brand button falls back to grey. */
        brand: {
          solid: { value: '{colors.brand.600}' },
          contrast: { value: '{colors.white}' },
          fg: { value: '{colors.brand.700}' },
          muted: { value: '{colors.brand.100}' },
          subtle: { value: '{colors.brand.50}' },
          emphasized: { value: '{colors.brand.200}' },
          focusRing: { value: '{colors.brand.500}' },
        },
        gold: {
          solid: { value: '{colors.gold.400}' },
          contrast: { value: '{colors.gray.950}' },
          fg: { value: '{colors.gold.600}' },
          muted: { value: '{colors.gold.100}' },
          subtle: { value: '{colors.gold.50}' },
          emphasized: { value: '{colors.gold.200}' },
          focusRing: { value: '{colors.gold.400}' },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);

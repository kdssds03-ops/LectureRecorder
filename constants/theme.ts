/**
 * Shared Design System Tokens
 * Tone preserved (warm sage / forest). Refined for a premium, calmer feel:
 * gentler type weights, proper line-heights, layered soft shadows.
 */

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screenPadding: 24,
};

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 9999,
};

export const Typography = {
  // Hero / large numerals (e.g. timers, big headers)
  display: {
    fontSize: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  titleLarge: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  titleMedium: {
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  bodyLarge: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '500' as const,
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
    lineHeight: 16,
  },
};

export const Shadows = {
  // Subtle, layered, low-opacity shadows for a calm premium depth.
  soft: {
    shadowColor: '#2A3B2E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  card: {
    shadowColor: '#2A3B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  medium: {
    shadowColor: '#2A3B2E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 28,
    elevation: 5,
  },
  floating: {
    shadowColor: '#3A5A40', // tinted shadow for primary buttons
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
};

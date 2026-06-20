/**
 * Shared Design System Tokens
 */
import { Platform } from 'react-native';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screenPadding: 24,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 9999,
};

export const Typography = {
  titleLarge: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  titleMedium: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  bodyLarge: {
    fontSize: 17,
    fontWeight: '600' as const,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500' as const,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
};

export const Shadows = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  floating: {
    shadowColor: '#34C7A5', // Tinted shadow for primary buttons
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  }
};


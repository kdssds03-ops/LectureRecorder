/**
 * 노깡(nokkang) - 디자인 시스템 컬러
 * Bright Ivory / White Background + Soft Mint / Sage Accent
 */

export const Colors = {
  light: {
    background: '#F8F9F7', // Ivory / Off-white (Ref 1 bg)
    surface: '#FFFFFF', // Clean White cards
    card: '#FFFFFF',

    // iOS style text hierarchy
    text: '#1C1C1E', // textPrimary: near black
    textSecondary: '#8E8E93', // textSecondary: medium gray
    textTertiary: '#C7C7CC', // textTertiary: light gray

    // Primary Accents (Mint / Sage)
    primary: '#34C7A5', // Bright Mint (Ref 3 Recording button)
    secondary: '#8FBC8F', // Soft Sage
    accent: '#E6F4EA', // Very light mint for highlights

    // Borders & UI elements
    border: '#E5E5EA', // Standard iOS light gray border
    unselectedChip: '#F2F2F7',

    // Status
    error: '#FF3B30',
    success: '#34C7A5',
    
    // Custom variants
    oliveLight: '#F2F2F7', // Keeping name for backward comp but acting as light neutral
    oliveDeep: '#34C7A5', // Mint equivalent
    shadow: 'rgba(0, 0, 0, 0.04)', // Very soft shadow
    textOnPrimary: '#FFFFFF',
  },
  dark: {
    background: '#000000',
    surface: '#1C1C1E',
    card: '#1C1C1E',

    text: '#F2F2F7',
    textSecondary: '#8E8E93',
    textTertiary: '#48484A',

    primary: '#32D74B', // iOS green
    secondary: '#30D158',
    accent: '#1C2C24', // deep green tint

    border: '#38383A',
    unselectedChip: '#2C2C2E',

    error: '#FF453A',
    success: '#32D74B',

    oliveLight: '#2C2C2E',
    oliveDeep: '#32D74B',
    shadow: 'rgba(0, 0, 0, 0.3)',
    textOnPrimary: '#FFFFFF',
  },
};

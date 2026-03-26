/**
 * Colors.ts
 * Based on the provided design image:
 * - Background: Warm Beige (#F9F7F2)
 * - Primary: Deep Forest Green (#3A5A40)
 * - Secondary: Earthy Brown (#A3B18A)
 * - Accent: Muted Gold (#D4A373)
 * - Text: Dark Charcoal (#344E41)
 */

export const Colors = {
  light: {
    background: '#F9F7F2', // Warm beige background from image
    surface: '#FFFFFF',
    card: '#FFFFFF',
    
    // iOS style text hierarchy
    text: '#344E41', // Dark Charcoal from image
    textSecondary: '#588157', // Muted green
    textTertiary: '#A3B18A', // Sage
    
    // Primary Accents (Deep Green / Gold)
    primary: '#3A5A40', // Deep green for buttons/accents
    secondary: '#A3B18A',
    accent: '#D4A373', // Muted gold for badges
    
    // Borders & UI elements
    border: '#E9E5D9',
    unselectedChip: '#E9E5D9',
    
    // Status
    error: '#BC4749',
    success: '#3A5A40',
    
    // Custom variants
    oliveLight: '#E9E5D9',
    oliveDeep: '#3A5A40',
    shadow: 'rgba(52, 78, 65, 0.08)', // Tinted shadow
    textOnPrimary: '#F9F7F2',
    
    // Specific elements from image
    floatingButton: '#344E41', // Dark floating button from image
    recordingButton: '#3A5A40', // Deep green recording button
  },
  dark: {
    background: '#1B261E', // Dark forest green/black
    surface: '#2A3B2E',
    card: '#2A3B2E',
    
    text: '#F9F7F2',
    textSecondary: '#A3B18A',
    textTertiary: '#588157',
    
    primary: '#588157',
    secondary: '#3A5A40',
    accent: '#D4A373',
    
    border: '#3A5A40',
    unselectedChip: '#2A3B2E',
    
    error: '#E63946',
    success: '#588157',
    
    oliveLight: '#2A3B2E',
    oliveDeep: '#588157',
    shadow: 'rgba(0, 0, 0, 0.3)',
    textOnPrimary: '#FFFFFF',
    
    floatingButton: '#588157',
    recordingButton: '#588157',
  },
};

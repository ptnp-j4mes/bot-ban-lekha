import { useColorScheme } from 'react-native';

type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

export const fontFaces = {
  latin: {
    regular: 'DMSans-Regular',
    medium: 'DMSans-Medium',
    semibold: 'DMSans-SemiBold',
    bold: 'DMSans-Bold',
    extrabold: 'DMSans-Bold',
  },
  sans: {
    regular: 'NotoSansThai-Regular',
    medium: 'NotoSansThai-Medium',
    semibold: 'NotoSansThai-SemiBold',
    bold: 'NotoSansThai-Bold',
    extrabold: 'NotoSansThai-Bold',
  },
  heading: {
    regular: 'PlusJakartaSans-Medium',
    medium: 'PlusJakartaSans-Medium',
    semibold: 'PlusJakartaSans-SemiBold',
    bold: 'PlusJakartaSans-Bold',
    extrabold: 'PlusJakartaSans-ExtraBold',
  },
  mono: {
    regular: 'FiraCode-Regular',
    medium: 'FiraCode-Medium',
    semibold: 'FiraCode-Medium',
    bold: 'FiraCode-Medium',
    extrabold: 'FiraCode-Medium',
  },
} as const;

export function font(family: keyof typeof fontFaces, weight: FontWeight = 'regular') {
  return fontFaces[family][weight];
}

export const palette = {
  // Keep the mobile palette in lockstep with admin/src/index.css.
  ink: '#0F172A',
  navy: '#0F172A',
  green: '#059669',
  greenSoft: '#E7F9F3',
  // Legacy names are retained for existing screens, but now map to the
  // project's navy primary and slate secondary tokens.
  coral: '#0F172A',
  coralSoft: '#F1F5F9',
  coralText: '#0F172A',
  cream: '#F8FAFC',
  paper: '#FFFFFF',
  line: '#E2E8F0',
  muted: '#475569',
  dashboardPage: '#F8FAFC',
  dashboardSurface: '#FFFFFF',
  dashboardCardMuted: '#F1F5F9',
  dashboardText: '#0F172A',
  dashboardTextSecondary: '#475569',
  dashboardTextMuted: '#475569',
  dashboardBorder: '#E2E8F0',
  dashboardCoral: '#0F172A',
  dashboardCoralSoft: '#F1F5F9',
  dashboardCoralText: '#0F172A',
  red: '#EF4444',
  redSoft: '#FEECEC',
  amber: '#B07207',
  amberSoft: '#FFF9E5',
};

export function useColors() {
  const dark = useColorScheme() === 'dark';
  return dark
      ? {
        ...palette,
        cream: '#0B1120',
        paper: '#141C2E',
        ink: '#F1F5F9',
        navy: '#F1F5F9',
        line: '#334157',
        muted: '#A3B0C2',
        dashboardPage: '#0B1120',
        dashboardSurface: '#141C2E',
        dashboardCardMuted: '#232E43',
        dashboardText: '#F1F5F9',
        dashboardTextSecondary: '#A3B0C2',
        dashboardTextMuted: '#A3B0C2',
        dashboardBorder: '#334157',
        dashboardCoral: '#18C38A',
        dashboardCoralSoft: '#232E43',
        dashboardCoralText: '#F1F5F9',
        green: '#18C38A',
        greenSoft: '#1B4134',
        coral: '#18C38A',
        coralSoft: '#232E43',
        coralText: '#F1F5F9',
        red: '#F87171',
        redSoft: '#511F1F',
        amber: '#FBBD23',
        amberSoft: '#4A3D26',
      }
    : palette;
}

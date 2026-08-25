import type { ComponentType, ReactNode } from 'react';
import { Platform, requireNativeComponent, View, type StyleProp, type ViewStyle } from 'react-native';

export type GlassViewProps = {
  accessibilityLabel?: string;
  children?: ReactNode;
  intensity?: number;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  style?: StyleProp<ViewStyle>;
};

type GlassViewRegistry = typeof globalThis & {
  __billAdminGlassView?: ComponentType<GlassViewProps>;
};

const registry = globalThis as GlassViewRegistry;

function getGlassView() {
  if (Platform.OS !== 'ios') return View as ComponentType<GlassViewProps>;
  if (registry.__billAdminGlassView) return registry.__billAdminGlassView;
  const glassView = requireNativeComponent<GlassViewProps>('GlassView');
  registry.__billAdminGlassView = glassView;
  return glassView;
}

export const GlassView = getGlassView();

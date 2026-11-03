/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#342832',
    background: '#E8D9E2',
    backgroundElement: '#F5EAF0',
    backgroundSelected: '#F0DCE5',
    textSecondary: '#765F6C',
    line: '#D9C3CF',
    primary: '#A64F76',
    primarySoft: '#F0DCE5',
    danger: '#B54D58',
  },
  dark: {
    text: '#F1E8EF',
    background: '#19141B',
    backgroundElement: '#241C25',
    backgroundSelected: '#432B3A',
    textSecondary: '#B5A4B1',
    line: '#493843',
    primary: '#B85D84',
    primarySoft: '#432B3A',
    danger: '#F08C91',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type AppPalette = (typeof Colors)[keyof typeof Colors];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'Nunito-Regular',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Nunito-Regular',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'Nunito-Regular',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

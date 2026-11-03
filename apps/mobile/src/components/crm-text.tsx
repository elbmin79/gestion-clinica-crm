import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type StyleProp, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

const familyForWeight = (weight: TextStyle['fontWeight']) => {
  const numeric = weight === 'bold' ? 700 : typeof weight === 'number' ? weight : Number(weight);
  if (numeric >= 800) return 'Nunito-ExtraBold';
  if (numeric >= 700) return 'Nunito-Bold';
  if (numeric >= 600) return 'Nunito-SemiBold';
  if (numeric >= 500) return 'Nunito-Medium';
  return 'Nunito-Regular';
};

function fontStyle(style: StyleProp<TextStyle>) {
  const resolved = StyleSheet.flatten(style) || {};
  return { ...resolved, fontFamily: resolved.fontFamily || familyForWeight(resolved.fontWeight), fontWeight: resolved.fontFamily ? resolved.fontWeight : 'normal' as const };
}

export function CrmText(props: TextProps) {
  return <NativeText {...props} style={fontStyle(props.style)} />;
}

export function CrmTextInput(props: TextInputProps) {
  return <NativeTextInput {...props} style={fontStyle(props.style)} />;
}

export type { TextProps, TextInputProps };

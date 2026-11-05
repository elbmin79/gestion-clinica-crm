import Animated, { ReduceMotion, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Pressable, StyleSheet, View } from 'react-native';

export function ThemeToggle({ dark, onPress }: { dark: boolean; onPress: () => void }) {
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(dark ? 32 : 0, {
      duration: 240,
      reduceMotion: ReduceMotion.System,
    }) }],
  }), [dark]);

  const nightSky = useAnimatedStyle(() => ({
    opacity: withTiming(dark ? 1 : 0, { duration: 240, reduceMotion: ReduceMotion.System }),
  }), [dark]);

  return (
    <Pressable accessibilityRole="switch" accessibilityLabel="Modo oscuro"
      accessibilityState={{ checked: dark }} onPress={onPress} style={styles.themeToggle}>
      <View style={[styles.themeTrack, { backgroundColor: '#777FE5' }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.cloudBank} />
          <View style={[styles.cloudPuff, { right: 20, bottom: 0, width: 17, height: 17 }]} />
          <View style={[styles.cloudPuff, { right: 8, bottom: 3, width: 21, height: 21 }]} />
          <View style={[styles.cloudPuff, { right: -7, bottom: 8, width: 24, height: 24 }]} />
        </View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#252337' }, nightSky]}>
          <View style={styles.stars} />
          <View style={styles.smallStar} />
          <View style={[styles.smallStar, { left: 25, top: 8, opacity: 0.65 }]} />
          <View style={[styles.smallStar, { left: 7, top: 22, width: 2, height: 2 }]} />
          <View style={[styles.smallStar, { left: 17, top: 28, width: 2, height: 2, opacity: 0.55 }]} />
        </Animated.View>
        <Animated.View style={[styles.themeThumb, { backgroundColor: dark ? '#E0E0EB' : '#FFBE4D' }, thumb]}>
          {dark && <>
            <View style={styles.moonSheen} />
            <View style={styles.crater} />
            <View style={[styles.crater, styles.smallCrater]} />
            <View style={[styles.crater, { left: 17, top: 15, width: 5, height: 5, opacity: 0.65 }]} />
            <View style={[styles.crater, { left: 8, top: 5, width: 3, height: 3, opacity: 0.55 }]} />
          </>}
          {!dark && <View style={styles.sunSheen} />}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  themeToggle: { alignSelf: 'flex-end', minHeight: 48, justifyContent: 'center' },
  themeTrack: { width: 68, height: 36, borderRadius: 18, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 4 },
  themeThumb: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#FFFFFF55', elevation: 2 },
  cloudBank: { position: 'absolute', right: 0, bottom: -7, width: 46, height: 17, borderRadius: 12, backgroundColor: '#BBC6F3' },
  cloudPuff: { position: 'absolute', borderRadius: 14, backgroundColor: '#F4F5FF' },
  sunSheen: { position: 'absolute', inset: -1, borderRadius: 14, boxShadow: '0 0 7px 2px #FFCB6480, inset 0 2px 5px #FFF2C880' },
  moonSheen: { position: 'absolute', inset: -1, borderRadius: 14, boxShadow: '0 0 7px 1px #C9D0FF66, inset 0 2px 5px #FFFFFF88' },
  stars: { position: 'absolute', left: 13, top: 10, width: 5, height: 5, backgroundColor: '#F4F0FF', transform: [{ rotate: '45deg' }] },
  smallStar: { position: 'absolute', left: 24, top: 23, width: 3, height: 3, borderRadius: 2, backgroundColor: '#D0CBE9' },
  crater: { position: 'absolute', left: 5, top: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: '#B8B7C9' },
  smallCrater: { left: 15, top: 5, width: 5, height: 5 },
});

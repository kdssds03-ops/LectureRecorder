import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  Easing,
  runOnJS
} from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width } = Dimensions.get('window');

interface AnimatedSplashScreenProps {
  onAnimationFinish: (finished: boolean) => void;
}

export default function AnimatedSplashScreen({ onAnimationFinish }: AnimatedSplashScreenProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const theme = Colors[colorScheme];
  
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    // Start animation sequence
    opacity.value = withTiming(1, { 
      duration: 1000, 
      easing: Easing.out(Easing.exp) 
    });
    
    scale.value = withTiming(1, { 
      duration: 1000, 
      easing: Easing.out(Easing.exp) 
    }, (finished) => {
      if (finished) {
        // Delay slightly before finishing to let the user see the logo
        setTimeout(() => {
          runOnJS(onAnimationFinish)(true);
        }, 800);
      }
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: '#121212' }]}>
      <Animated.View style={[styles.logoContainer, animatedStyle]}>
        <Text style={[styles.logoText, { color: (theme as any).oliveDeep || '#C2D68F' }]}>
          Lecture{"\n"}Recorder
        </Text>
        <View style={[styles.underline, { backgroundColor: (theme as any).oliveDeep || '#C2D68F' }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
    lineHeight: 52,
  },
  underline: {
    width: 60,
    height: 6,
    borderRadius: 3,
    marginTop: 16,
  },
});

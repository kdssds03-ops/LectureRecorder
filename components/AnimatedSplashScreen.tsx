import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions, Image } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  Easing,
  runOnJS
} from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width, height } = Dimensions.get('window');

interface AnimatedSplashScreenProps {
  onAnimationFinish: (finished: boolean) => void;
}

export default function AnimatedSplashScreen({ onAnimationFinish }: AnimatedSplashScreenProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    opacity.value = withTiming(1, { 
      duration: 600, 
      easing: Easing.out(Easing.exp) 
    });
    
    scale.value = withTiming(1, { 
      duration: 600, 
      easing: Easing.out(Easing.exp) 
    }, (finished) => {
      if (finished) {
        setTimeout(() => {
          runOnJS(onAnimationFinish)(true);
        }, 1200);
      }
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  // Matches the app.json native splash background color
  return (
    <View style={[styles.container, { backgroundColor: '#F1F5E9' }]}>
      <Animated.View style={[styles.logoContainer, animatedStyle]}>
        <Image 
          source={require('../assets/images/splash.png')}
          style={styles.image}
          resizeMode="contain"
        />
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
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});


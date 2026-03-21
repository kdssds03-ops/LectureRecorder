import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence, 
  withDelay,
  runOnJS
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SnackbarProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
  duration?: number;
}

export default function Snackbar({ 
  visible, 
  message, 
  onDismiss, 
  duration = 2500 
}: SnackbarProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const theme = Colors[colorScheme];
  
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (visible) {
      // Entry Animation
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withTiming(0, { duration: 300 });

      // Exit Animation after delay
      const timeout = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 300 }, (finished) => {
          if (finished) {
            runOnJS(onDismiss)();
          }
        });
        translateY.value = withTiming(20, { duration: 300 });
      }, duration);

      return () => clearTimeout(timeout);
    } else {
      opacity.value = 0;
      translateY.value = 20;
    }
  }, [visible, message]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[
        styles.snackbar, 
        { backgroundColor: theme.card, borderColor: theme.border },
        animatedStyle
      ]}>
        <View style={[styles.accent, { backgroundColor: (theme as any).oliveDeep || theme.primary }]} />
        <MaterialIcons 
          name="check-circle" 
          size={20} 
          color={(theme as any).oliveDeep || theme.primary} 
          style={styles.icon} 
        />
        <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // Above typical tab bar height
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: '85%',
    maxWidth: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  icon: {
    marginRight: 12,
    marginLeft: 4,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
});

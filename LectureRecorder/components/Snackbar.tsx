import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
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
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 400 });
      translateY.value = withTiming(0, { duration: 400 });

      const timeout = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 400 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        });
        translateY.value = withTiming(20, { duration: 400 });
      }, duration);

      return () => clearTimeout(timeout);
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
        { backgroundColor: theme.card, shadowColor: (theme as any).shadow },
        animatedStyle
      ]}>
        <View style={[styles.iconBox, { backgroundColor: (theme as any).oliveLight }]}>
          <MaterialIcons name="check" size={18} color={theme.primary} />
        </View>
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
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    minWidth: '80%',
    maxWidth: '90%',
    elevation: 10,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
});

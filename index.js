// Custom entry point.
// 1) Boots Expo Router (registers the root component).
// 2) Registers the Track Player playback service so lock-screen / Control Center
//    / notification remote controls work even when the app is backgrounded.
import 'expo-router/entry';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './service';

TrackPlayer.registerPlaybackService(() => PlaybackService);

// One-time Track Player setup. Idempotent via a memoized promise so concurrent
// callers (e.g. several detail screens) never double-initialize the player.
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
} from 'react-native-track-player';

let setupPromise: Promise<void> | null = null;

export function ensurePlayerSetup(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
      } catch {
        // Already initialized — safe to ignore and continue to updateOptions.
      }
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        },
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SeekTo,
          Capability.JumpForward,
          Capability.JumpBackward,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.Stop,
        ],
        compactCapabilities: [Capability.Play, Capability.Pause, Capability.SeekTo],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SeekTo,
          Capability.JumpForward,
          Capability.JumpBackward,
        ],
        progressUpdateEventInterval: 1,
      });
      await TrackPlayer.setRepeatMode(RepeatMode.Off);
    })().catch((err) => {
      // Reset so a later attempt can retry if setup genuinely failed.
      setupPromise = null;
      throw err;
    });
  }
  return setupPromise;
}

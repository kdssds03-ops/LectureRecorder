// Track Player playback service.
// Runs in its own JS context to handle remote control events from the lock
// screen, Control Center, notification, headset buttons, and Android Auto.
import TrackPlayer, { Event } from 'react-native-track-player';

const JUMP_SECONDS = 15;

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext().catch(() => {}));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious().catch(() => {}));

  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => {
    if (e && typeof e.position === 'number') TrackPlayer.seekTo(e.position);
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async (e) => {
    const { position } = await TrackPlayer.getProgress();
    TrackPlayer.seekTo(position + (e?.interval ?? JUMP_SECONDS));
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (e) => {
    const { position } = await TrackPlayer.getProgress();
    TrackPlayer.seekTo(Math.max(0, position - (e?.interval ?? JUMP_SECONDS)));
  });
}

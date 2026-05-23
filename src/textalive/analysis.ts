import type { Player } from "textalive-app-api";

// Live, per-frame signals derived from the TextAlive player at a given position (ms).
// All guarded so they are safe to call before the video/beat data is available.

export function getBeatAmp(player: Player, pos: number): number {
  const beat = player.findBeat?.(pos);
  if (beat && beat.duration > 0) {
    return Math.max(0, 1 - ((pos - beat.startTime) / beat.duration) * 3);
  }
  return 0;
}

export function getVocalAmp(player: Player, pos: number): number {
  if (!player.getVocalAmplitude || !player.getMaxVocalAmplitude) return 0;
  const max = player.getMaxVocalAmplitude();
  if (!max) return 0;
  return Math.min(1, player.getVocalAmplitude(pos) / max);
}

export function getProgress(player: Player, pos: number): number {
  const duration = player.video?.duration ?? 0;
  return duration > 0 ? Math.min(1, pos / duration) : 0;
}

export function isChorus(player: Player, pos: number): boolean {
  return !!player.findChorus?.(pos);
}

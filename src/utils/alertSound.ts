export type AlertSoundKind = 'precursor' | 'low' | 'medium' | 'high' | 'critical';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, gain = 0.08) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

export function playAlertSound(kind: AlertSoundKind) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  const t = ctx.currentTime;
  const map: Record<AlertSoundKind, () => void> = {
    precursor: () => {
      tone(ctx, 880, t, 0.08);
      tone(ctx, 880, t + 0.15, 0.08);
    },
    low: () => tone(ctx, 520, t, 0.12),
    medium: () => {
      tone(ctx, 660, t, 0.1);
      tone(ctx, 660, t + 0.12, 0.1);
    },
    high: () => {
      tone(ctx, 780, t, 0.08);
      tone(ctx, 920, t + 0.1, 0.08);
      tone(ctx, 780, t + 0.2, 0.08);
    },
    critical: () => {
      tone(ctx, 980, t, 0.15, 0.1);
      tone(ctx, 740, t + 0.18, 0.15, 0.1);
    },
  };
  map[kind]();
}

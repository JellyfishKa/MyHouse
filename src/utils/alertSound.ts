export type AlertSoundKind = 'precursor' | 'low' | 'medium' | 'high' | 'critical';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void getCtx()?.resume();
    }
  });
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

function playTones(ctx: AudioContext, kind: AlertSoundKind) {
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

/** Call on user gesture (e.g. stress-test click) so sounds work in background tabs. */
export function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume().then(() => {
    if (ctx.state === 'running') {
      tone(ctx, 40, ctx.currentTime, 0.02, 0.001);
    }
  });
}

export async function playAlertSound(kind: AlertSoundKind) {
  const ctx = getCtx();
  if (!ctx) return;

  try {
    await ctx.resume();
  } catch {
    /* policy blocked */
  }

  if (ctx.state === 'running') {
    playTones(ctx, kind);
  }
}

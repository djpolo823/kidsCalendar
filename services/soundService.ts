
class SoundService {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Crea un sonido con envolvente suave para evitar chasquidos y estridencias.
   */
  private createSoftNote(freq: number, type: OscillatorType = 'sine', startTime: number, duration: number, volume: number = 0.1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    // Envolvente ADSR simplificada para suavidad (Healthy Gameplay)
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.05); // Ataque suave
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); // Decaimiento natural

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  /**
   * Sonido de éxito: Melodía pentatónica ascendente y pausada.
   * Transmite logro sin estrés.
   */
  playSuccess() {
    this.init();
    const now = this.ctx!.currentTime;
    // Escala de Do mayor pentatónica (C4, D4, E4, G4) - Muy armónica
    const notes = [261.63, 293.66, 329.63, 392.00];
    notes.forEach((freq, i) => {
      // Usamos 'triangle' para un toque similar a un xilófono de madera
      this.createSoftNote(freq, 'triangle', now + i * 0.15, 0.8, 0.12);
    });
  }

  /**
   * Sonido de inicio: Un "llamado" amable de dos tonos.
   */
  playStart() {
    this.init();
    const now = this.ctx!.currentTime;
    this.createSoftNote(349.23, 'sine', now, 0.4, 0.08); // Fa4
    this.createSoftNote(440.00, 'sine', now + 0.2, 0.6, 0.1); // La4
  }

  /**
   * Sonido de estrellas: Un brillo sutil, no estridente.
   */
  playStar() {
    this.init();
    const now = this.ctx!.currentTime;
    // Frecuencias más bajas que antes para proteger los oídos sensibles
    for (let i = 0; i < 3; i++) {
      const freq = 800 + (i * 200);
      this.createSoftNote(freq, 'sine', now + i * 0.08, 0.3, 0.04);
    }
  }

  /**
   * Sonido de UI (Click): Una burbuja de aire muy suave.
   */
  playClick() {
    this.init();
    const now = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();

    // Descenso de frecuencia rápido (tipo "plop" orgánico)
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx!.destination);
    osc.start();
    osc.stop(now + 0.1);
  }
  private bgMusicInterval: any = null;

  /**
   * Inicia una melodía de fondo suave y alegre (tipo caja de música).
   */
  startBackgroundMusic() {
    this.init();
    if (this.bgMusicInterval) return;

    const melody = [
      { f: 261.63, d: 0.4 }, { f: 329.63, d: 0.4 }, { f: 392.00, d: 0.4 }, // C E G
      { f: 523.25, d: 0.8 }, { f: 392.00, d: 0.4 }, { f: 329.63, d: 0.4 }, // C5 G E
    ];
    let noteIndex = 0;

    const playNext = () => {
      if (!this.ctx) return;
      const note = melody[noteIndex % melody.length];
      const now = this.ctx.currentTime;

      // Sonido muy suave y 'dulce' (sine wave)
      this.createSoftNote(note.f, 'sine', now, note.d, 0.10);

      noteIndex++;
    };

    playNext(); // Play first immediately
    this.bgMusicInterval = setInterval(playNext, 600); // Loop timing
  }

  /**
   * Sonido de caja registradora: "Cha-ching!"
   */
  playCashRegister() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // "Cha" - Ruido metálico rápido
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(2000, now);
    osc1.frequency.exponentialRampToValueAtTime(500, now + 0.1);
    gain1.gain.setValueAtTime(0.1, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // "Ching" - Dos tonos agudos y brillantes
    setTimeout(() => {
      if (!this.ctx) return;
      const now2 = this.ctx.currentTime;
      this.createSoftNote(1200, 'sine', now2, 0.4, 0.15);
      this.createSoftNote(2400, 'sine', now2, 0.4, 0.1);
    }, 100);
  }

  stopBackgroundMusic() {
    if (this.bgMusicInterval) {
      clearInterval(this.bgMusicInterval);
      this.bgMusicInterval = null;
    }
  }

  /**
   * Sonido de error: Dos tonos graves descendentes.
   */
  playError() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.createSoftNote(150, 'sawtooth', now, 0.2, 0.1);
    this.createSoftNote(110, 'sawtooth', now + 0.15, 0.4, 0.12);
  }

  /**
   * Sonido de nivel superado: Fanfarria ascendente brillante.
   */
  playLevelUp() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // Mi4, Sol4, Do5, Mi5, Sol5, Do6
    notes.forEach((freq, i) => {
      this.createSoftNote(freq, 'sine', now + i * 0.08, 0.5, 0.1);
    });
  }

  /**
   * Sonido de notificación/alerta: Un tono suave y armónico de atención.
   */
  playNotification() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Tono campana suave (F5, A5)
    this.createSoftNote(698.46, 'sine', now, 0.3, 0.1);
    this.createSoftNote(880.00, 'sine', now + 0.15, 0.5, 0.08);
  }
}

export const sounds = new SoundService();

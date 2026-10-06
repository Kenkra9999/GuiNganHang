// Web Audio API Sound Generator for Realistic Banking Experience
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.initAudioContext();
    }

    initAudioContext() {
        if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleSound() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // Âm thanh Ting-Ting thông báo tiền về / chuyển tiền thành công
    playTingTing() {
        if (!this.enabled) return;
        this.initAudioContext();
        this.resume();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        // Note 1 (E6 - 1318.5 Hz)
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1318.5, now);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.5);

        // Note 2 (G#6 - 1661.2 Hz) - sau 0.1s
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1661.2, now + 0.12);
        gain2.gain.setValueAtTime(0.4, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.7);

        // Note 3 (B6 - 1975.5 Hz) - tạo âm hưởng ngân vang cực sang trọng
        const osc3 = this.ctx.createOscillator();
        const gain3 = this.ctx.createGain();
        osc3.type = 'triangle';
        osc3.frequency.setValueAtTime(1975.5, now + 0.24);
        gain3.gain.setValueAtTime(0.35, now + 0.24);
        gain3.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        osc3.connect(gain3);
        gain3.connect(this.ctx.destination);
        osc3.start(now + 0.24);
        osc3.stop(now + 1.2);
    }

    // Âm thanh nhận lãi tiết kiệm (Coin Chime)
    playInterestChime() {
        if (!this.enabled) return;
        this.initAudioContext();
        this.resume();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const freqs = [1046.5, 1318.5, 1567.98, 2093.0]; // C6, E6, G6, C7
        
        freqs.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            gain.gain.setValueAtTime(0.2, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.4);
        });
    }

    // Âm thanh rút tiền (Triumphant Chord)
    playWithdraw() {
        if (!this.enabled) return;
        this.initAudioContext();
        this.resume();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        
        notes.forEach((freq) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.9);
        });
    }

    // Âm thanh gửi tiết kiệm thành công (Cash Register Ka-ching)
    playCashRegister() {
        if (!this.enabled) return;
        this.initAudioContext();
        this.resume();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        // Metallic clink 1
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(2400, now);
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.1);

        // Bell ring
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1760, now + 0.08);
        gain2.gain.setValueAtTime(0.4, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.8);
    }

    // Âm thanh bấm nút (Soft Pop)
    playClick() {
        if (!this.enabled) return;
        this.initAudioContext();
        this.resume();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    // Âm thanh cảnh báo lỗi
    playError() {
        if (!this.enabled) return;
        this.initAudioContext();
        this.resume();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    }
}

const soundManager = new SoundManager();

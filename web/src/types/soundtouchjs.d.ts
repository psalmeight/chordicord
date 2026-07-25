/**
 * SoundTouchJS ships no types. This declares only the surface we use — the
 * PitchShifter, which time-stretches and pitch-shifts an AudioBuffer.
 */
declare module 'soundtouchjs' {
  export interface PitchShifterProgress {
    timePlayed: number;
    formattedTimePlayed: string;
    percentagePlayed: number;
  }

  export class PitchShifter {
    constructor(context: AudioContext, buffer: AudioBuffer, bufferSize: number, onEnd?: () => void);

    /** Shift in semitones. Negative pitches down; tempo is unaffected. */
    set pitchSemitones(semitones: number);
    set tempo(tempo: number);
    set rate(rate: number);

    readonly duration: number;
    readonly node: AudioNode;
    percentagePlayed: number;

    connect(toNode: AudioNode): void;
    disconnect(): void;
    on(eventName: 'play', cb: (detail: PitchShifterProgress) => void): void;
    off(eventName?: string): void;
  }
}

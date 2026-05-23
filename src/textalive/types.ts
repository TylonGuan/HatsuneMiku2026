import { Vector3 } from "three";

export interface CharDatum {
  text: string;
  phraseIndex: number;
  phraseStart: number; // ms
  phraseEnd: number; // ms
  entry: Vector3;
  settle: Vector3;
  exit: Vector3;
  windPhase: number;
}

export interface PhraseDatum {
  index: number;
  text: string;
  startTime: number; // ms
  endTime: number; // ms
}

export interface LyricData {
  chars: CharDatum[];
  phrases: PhraseDatum[];
  duration: number; // ms
}

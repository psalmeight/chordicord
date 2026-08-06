/** A colored note callout. `section` anchors it to a chart section; '' pins it
 *  to the top of the song as a general note. */
export interface NoteCard {
  color: string;
  text: string;
  section: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  /** null when the key is unknown — transposition is unavailable until it's set. */
  key: string | null;
  timeSignature: string;
  tempo: number | null;
  feel: string;
  ccli: string;
  notes: string;
  noteCards: NoteCard[];
  tags: string[];
  content: string;
  /** How many columns the chart renders in (1 or 2). */
  chartColumns: number;
  createdBy: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  hasAudio: boolean;
}

/** A reference recording. `url` is signed and expires — refetch, don't cache. */
export interface SongAudio {
  id: string;
  songId: string;
  filename: string;
  sizeBytes: number;
  /** Saved playback pitch offset in semitones. 0 = original pitch. */
  tuneOffset: number;
  createdAt: string;
  url: string;
  expiresIn: number;
}

export interface AudioLibraryItem {
  id: string;
  songId: string;
  title: string;
  artist: string;
  filename: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
}

export interface AudioLibrary {
  items: AudioLibraryItem[];
  limit: number;
  used: number;
}

export interface Setlist {
  id: string;
  name: string;
  serviceDate: string | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A setlist item owns a snapshot copy of its song, taken when it was added.
 *  title..noteCards are the item's own — editing them never touches the
 *  songbank, and songbank edits only arrive via an explicit re-sync. */
export interface SetlistItem {
  id: string;
  setlistId: string;
  /** The songbank song this was copied from — the audio link and re-sync
   *  source. null once the songbank song has been deleted. */
  songId: string | null;
  position: number;
  keyOverride: string | null;
  /** Per-setlist tune override; null falls back to audioTuneOffset. */
  tuneOffset: number | null;
  notes: string;
  title: string;
  artist: string;
  key: string | null;
  timeSignature: string;
  tempo: number | null;
  feel: string;
  content: string;
  noteCards: NoteCard[];
  /** How many columns the chart renders in (1 or 2) — part of the snapshot. */
  chartColumns: number;
  /** Whether the song has a reference recording to play along with. */
  hasAudio: boolean;
  /** The recording's own saved tune — the fallback when tuneOffset is null. */
  audioTuneOffset: number;
  /** Your own capo for this item — private to your account. */
  myCapo: number;
  /** Your own note for this item — private to your account. */
  myNotes: string;
}

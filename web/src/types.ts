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
  tags: string[];
  content: string;
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

export interface SetlistItem {
  id: string;
  setlistId: string;
  songId: string;
  position: number;
  keyOverride: string | null;
  notes: string;
  title: string;
  artist: string;
  key: string | null;
  timeSignature: string;
  tempo: number | null;
  feel: string;
  content: string;
}

export interface Category {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Prayer {
  id: string;
  /** null when the prayer is uncategorized. */
  categoryId: string | null;
  title: string;
  details: string;
  createdAt: string;
  updatedAt: string;
}

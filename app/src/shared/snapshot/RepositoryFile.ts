import type { FileReadability } from "./FileReadability";

export type RepositoryFile = {
  path: string;
  name: string;
  extension: string | null;
  size: number;
  readability: FileReadability;
};

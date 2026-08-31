import type { CodeTarget } from "./CodeTarget";

export type CodeAnnotation = {
  id: string;
  label: string;
  explanation: string;
  target: CodeTarget;
};

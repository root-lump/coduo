export type ReviewRequest = { "kind": "repository" } | {
  "kind": "file";
  path: string;
} | { "kind": "pull_request" };

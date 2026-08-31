import type { ReviewStep } from "./ReviewStep";

export type ReviewTour = {
  title: string;
  summary: string;
  steps: Array<ReviewStep>;
};

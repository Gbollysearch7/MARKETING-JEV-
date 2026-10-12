/**
 * Types for the TypeSafe System One API (POST /v1/systemone).
 * Shapes follow https://docs.typesafe.ai/api as of October 2026.
 */

export type Instructions = string | Record<string, unknown> | unknown[];

export interface NoulQuestion {
  type: 'noul';
  instructions: Instructions;
  criteria?: { true?: Instructions; false?: Instructions };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: Instructions;
  /** Option key -> description. Up to 255 options. */
  criteria: Record<string, Instructions | null>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: Instructions;
  /** Ordered level descriptions, low to high. 2 to 10 levels. */
  criteria: Instructions[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Record<string, Question>;
export type State = string | Record<string, unknown> | unknown[];

export interface SystemOneRequest {
  model: string;
  state: State;
  questions: Questions;
}

export interface NoulAnswer {
  type: 'noul';
  /** Probability that the answer is yes, 0 to 1. */
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  /** Probability-weighted position on the levels, 0 to levels-1. */
  score: number;
  legend: Record<string, Instructions>;
  /** Keyed by level index as a string. */
  probabilities: Record<string, number>;
  confidence: number;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Record<string, Answer>;

export interface SystemOneResponse {
  model: string;
  answers: Answers;
  usage: { input_tokens: number; output_tokens: number };
}

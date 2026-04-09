import { stepEngine } from "../engine/step.js";

export const referenceAdapter = {
  step(state, transactions) {
    return stepEngine(state, transactions);
  }
};

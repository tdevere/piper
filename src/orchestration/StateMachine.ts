import { Case, CaseState } from "../types";

export class StateMachine {
  
  canTransition(current: Case, next: CaseState): { allowed: boolean; reason?: string } {
    if (current.state === next) return { allowed: true };

    // Global Gate: Cannot resolve if required questions are open
    if (next === CaseState.Resolve) {
      if (this.hasUnansweredRequiredQuestions(current)) {
        return { allowed: false, reason: "Cannot Resolve: Required questions are unanswered." };
      }
      if (!current.hypotheses.some(h => h.status === "Validated") && !current.outcome) {
         // Allow if there is an outcome explaining why (e.g. Limitation)
         // But strictly, we prefer validated hypotheses.
      }
    }

    // Gate: Plan -> Execute requires hypotheses
    if (current.state === CaseState.Plan && next === CaseState.Execute) {
      if (current.hypotheses.length === 0) {
        return { allowed: false, reason: "Cannot Execute: No hypotheses to test." };
      }
    }

    // Gate: Intake -> Normalize requires required questions to be answered
    if (current.state === CaseState.Intake && next === CaseState.Normalize) {
      if (this.hasUnansweredRequiredQuestions(current)) {
        const unanswered = current.questions.filter(q => q.required && q.status === 'Open');
        return { 
          allowed: false, 
          reason: `Cannot progress: ${unanswered.length} required questions unanswered. Use 'piper analyze ${current.id}' to auto-answer from evidence, or 'piper answer' to provide manually.` 
        };
      }
    }

    return { allowed: true };
  }

  getRecommendedState(current: Case): CaseState {
    // Deterministic progression if manual override not present
    switch (current.state) {
      case CaseState.Intake: return CaseState.Normalize;
      case CaseState.Normalize: return CaseState.Classify;
      case CaseState.Classify: return CaseState.Plan;
      case CaseState.Plan: return CaseState.Execute;
      case CaseState.Execute: return CaseState.Evaluate;
      case CaseState.Evaluate: 
        return current.hypotheses.some(h => h.status === 'Validated') 
          ? CaseState.Resolve
          : CaseState.Plan; // Loop back to revise plan
      case CaseState.Resolve: return CaseState.ReadyForSolution;
      case CaseState.ReadyForSolution: return CaseState.Postmortem;
      case CaseState.Postmortem: return CaseState.Postmortem; // Terminal state
      default: return current.state;
    }
  }

  private hasUnansweredRequiredQuestions(c: Case): boolean {
    return c.questions.some(q => q.required && q.status === "Open");
  }
}

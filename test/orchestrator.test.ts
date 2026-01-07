import { Orchestrator } from '../src/orchestration/Orchestrator';
import { CaseStore } from '../src/storage/CaseStore';
import { StateMachine } from '../src/orchestration/StateMachine';
import { LLMClient } from '../src/llm/LLMClient';
import { CaseState, Case } from '../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';

const TEST_DIR = './test_data';

describe('Orchestrator', () => {
  let orch: Orchestrator;
  let store: CaseStore;

  beforeAll(() => {
    fs.ensureDirSync(TEST_DIR);
    store = new CaseStore(TEST_DIR);
    orch = new Orchestrator(store, new StateMachine(), new LLMClient('./examples'));
  });

  afterAll(() => {
    fs.removeSync(TEST_DIR);
  });

  test('Refuses Resolve when required questions are unanswered', async () => {
    const c: Case = {
      id: 'test-1',
      principlesVersion: '1',
      title: 'test',
      state: CaseState.Evaluate, // Ready to resolve?
      formal: { expected: '', actual: '' },
      hypotheses: [],
      questions: [{ id: 'q1', ask: 'required?', required: true, status: 'Open', expectedFormat: 'text' }],
      evidence: [],
      events: [],
      unknowns: []
    };
    await store.save(c);

    // Try to transition to Resolve manually via logic or force next
    // The state machine inside next() should block it if recommended is Resolve, 
    // or if we explicitly ask if we can transition.
    
    const sm = new StateMachine();
    const result = sm.canTransition(c, CaseState.Resolve);
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Required questions are unanswered');
  });
});

import * as fs from 'fs-extra';
import * as path from 'path';
import { Case, AgentResponse, CaseState, Question, Evidence } from '../types';
import { AgentSession, AgentMessage } from '../agents/types';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

export class LLMClient {
  private openai: OpenAI | null = null;
  private llmEnabled: boolean;
  private llmProvider: string;
  
  constructor(private fixturesDir: string) {
    this.llmEnabled = process.env.LLM_ENABLED === 'true';
    this.llmProvider = process.env.LLM_PROVIDER || 'openai';
    
    if (process.env.DEBUG) {
      console.log(`[LLMClient] Enabled: ${this.llmEnabled}, Provider: ${this.llmProvider}`);
    }
    
    if (this.llmEnabled && this.llmProvider === 'openai' && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  async consult(c: Case, promptProfile: string): Promise<AgentResponse> {
    // 1. Try to find a specific fixture: {Profile}.{State}.json
    const specialist = c.specialistProfile || 'generic';
    const fixtureName = `${specialist}.${c.state}.json`;
    const fixturePath = path.join(this.fixturesDir, fixtureName);

    if (await fs.pathExists(fixturePath)) {
      return fs.readJSON(fixturePath);
    }

    // 2. Fallback to Generic
    const genericPath = path.join(this.fixturesDir, `generic.${c.state}.json`);
    if (await fs.pathExists(genericPath)) {
        return fs.readJSON(genericPath);
    }
    
    // 3. Fallback: No-Op response
    return {
        thoughtProcess: "No specific intelligence logic found for this state/profile combination (Mock).",
        recommendedState: c.state // Stay put
    };
  }

  async analyzeForQuestions(
    c: Case, 
    questions: Question[]
  ): Promise<{
    suggestions: Array<{ 
      questionId: string; 
      question: string; 
      suggestedAnswer: string; 
      confidence: string; 
      evidenceRefs: string[];
      alternatives?: Array<{ answer: string; confidence: string }>;
      searchInstructions?: string;
    }>;
  }> {
    // Try LLM if enabled
    if (this.llmEnabled) {
      try {
        if (this.llmProvider === 'copilot' || this.llmProvider === 'copilot-auto') {
          return await this.analyzeWithCopilot(c, questions);
        } else if (this.llmProvider === 'openai' && this.openai) {
          return await this.analyzeWithOpenAI(c, questions);
        }
      } catch (error: any) {
        console.error(`AI analysis failed, falling back to heuristics:`, error.message);
      }
    }

    // Use heuristic pattern matching analysis
    return await this.analyzeWithHeuristics(c, questions);
  }

  private async analyzeWithCopilot(
    c: Case,
    questions: Question[]
  ): Promise<{
    suggestions: Array<{ 
      questionId: string; 
      question: string; 
      suggestedAnswer: string; 
      confidence: string; 
      evidenceRefs: string[];
      alternatives?: Array<{ answer: string; confidence: string }>;
      searchInstructions?: string;
    }>;
  }> {
    const { execSync } = require('child_process');
    const evidenceContent = await this.loadEvidenceContent(c);
    const truncatedEvidence = evidenceContent.substring(0, 15000);

    const systemPrompt = `You are an expert Azure DevOps and Azure troubleshooting assistant. When analyzing logs and answering questions:

1. Extract SPECIFIC values (resource names, IDs, error codes, timestamps)
2. Reference official Microsoft documentation when relevant
3. Provide alternative answers when evidence is ambiguous
4. Include search terms to help users find information in logs
5. Be precise and technical - this is for DevOps engineers

Always base answers on evidence provided.`;
    
    const userPrompt = `Analyze these deployment logs to answer troubleshooting questions.

PROBLEM: ${c.formal.actual}
CONTEXT: ${c.context || 'general'}

QUESTIONS:
${questions.map((q, i) => `${i + 1}. [${q.id}] ${q.ask}`).join('\n')}

EVIDENCE LOGS:
${truncatedEvidence}

For each question you can answer from the evidence, provide:
1. questionId (e.g., "q1")
2. answer (the actual answer from evidence)
3. confidence: "high", "medium", or "low"
4. alternatives: up to 3 alternative answers if multiple possibilities exist
5. searchInstructions: helpful search terms or patterns to find this info

Respond in JSON format:
{
  "suggestions": [
    {
      "questionId": "q1",
      "answer": "...",
      "confidence": "high",
      "alternatives": [{"answer": "...", "confidence": "medium"}],
      "searchInstructions": "Search for ##[error] in logs"
    }
  ]
}`;

    try {
      // Call copilot-auto wrapper in direct mode
      const { execSync } = require('child_process');
      const os = require('os');
      const fs = require('fs-extra');
      const path = require('path');
      
      const command = process.env.COPILOT_AUTO_PATH || 'copilot-auto';
      
      // Build structured prompt for direct mode
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nProvide your answer in this format:\nQUESTION_ID: <id>\nANSWER: <answer>\nCONFIDENCE: high|medium|low\nALTERNATIVES: <alternative1>; <alternative2>\nSEARCH: <search terms>\n\n(Repeat for each question you can answer)`;
      
      // Write prompt to temp file to avoid command line length issues
      const tempFile = path.join(os.tmpdir(), `piper-analyze-${Date.now()}.txt`);
      await fs.writeFile(tempFile, fullPrompt);
      
      // Execute copilot-auto with input redirection
      const result = execSync(`powershell -Command "Get-Content '${tempFile}' | & ${command} --interactive"`, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 10,
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Clean up temp file
      await fs.remove(tempFile);
      
      // Parse structured text response
      const suggestions = this.parseStructuredResponse(result, questions);
      
      return { suggestions };
    } catch (error: any) {
      // If copilot-auto not available or fails, fall back to heuristics
      console.error('Copilot analysis unavailable:', error.message);
      if (error.stderr) console.error('Stderr:', error.stderr);
      console.error('Falling back to pattern matching');
      return await this.analyzeWithHeuristics(c, questions);
    }
  }

  async generateGuidance(prompt: string): Promise<string> {
    // Generate dynamic guidance for help command
    if (process.env.DEBUG) {
      console.log(`[LLMClient.generateGuidance] Provider: ${this.llmProvider}, Enabled: ${this.llmEnabled}`);
    }
    
    if (this.llmEnabled && (this.llmProvider === 'copilot' || this.llmProvider === 'copilot-auto')) {
      try {
        const { execSync } = require('child_process');
        const os = require('os');
        const fs = require('fs-extra');
        const path = require('path');
        
        const command = process.env.COPILOT_AUTO_PATH || 'copilot-auto';
        
        // Write the actual prompt to a temp file
        const tempFile = path.join(os.tmpdir(), `piper-prompt-${Date.now()}.txt`);
        await fs.writeFile(tempFile, prompt);
        
        // Direct instruction to read and follow the file
        const metaInstruction = `Read the file ${tempFile} and follow all the instructions in it.`;
        
        try {
          if (process.env.DEBUG) {
            console.log(`[LLMClient] Calling copilot-auto with temp file: ${tempFile}`);
          }
          
          // Call copilot-auto with meta-instruction
          const result = execSync(`${command} --direct "${metaInstruction.replace(/"/g, '\\"')}"`, {
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024 * 5,
            timeout: 120000,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          await fs.remove(tempFile);
          
          // Extract just the response, removing copilot-auto metadata
          const lines = result.split('\n');
          const responseStart = lines.findIndex((line: string) => line.includes('Prompt:') || line.startsWith('📝'));
          if (responseStart >= 0) {
            // Skip prompt echo and metadata, get actual response
            const responsePart = lines.slice(responseStart + 2).join('\n').trim();
            // Remove trailing usage statistics
            const usageStart = responsePart.indexOf('Total usage est:');
            const cleaned = usageStart > 0 ? responsePart.substring(0, usageStart).trim() : responsePart;
            
            if (process.env.DEBUG) {
              console.log(`[LLMClient] Got response (${cleaned.length} chars)`);
            }
            
            return cleaned;
          }
          return result.trim();
        } finally {
          // Ensure cleanup even if error
          if (await fs.pathExists(tempFile)) {
            await fs.remove(tempFile);
          }
        }
      } catch (error: any) {
        console.error('Copilot-auto guidance error:', error.message);
        if (error.stderr) console.error('Stderr:', error.stderr);
        throw new Error(`Guidance generation failed: ${error.message}`);
      }
    } else if (this.llmEnabled && this.llmProvider === 'openai' && this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 500
        });
        return response.choices[0]?.message?.content || 'Unable to generate guidance';
      } catch (error) {
        throw new Error('Guidance generation failed');
      }
    }
    
    throw new Error('No AI provider available');
  }


  private async analyzeWithOpenAI(
    c: Case,
    questions: Question[]
  ): Promise<{
    suggestions: Array<{ 
      questionId: string; 
      question: string; 
      suggestedAnswer: string; 
      confidence: string; 
      evidenceRefs: string[];
      alternatives?: Array<{ answer: string; confidence: string }>;
      searchInstructions?: string;
    }>;
  }> {
    const evidenceContent = await this.loadEvidenceContent(c);
    const truncatedEvidence = evidenceContent.substring(0, 15000); // Limit context size

    const prompt = `You are analyzing deployment logs to answer troubleshooting questions.

PROBLEM:
${c.formal.actual}

QUESTIONS TO ANSWER:
${questions.map((q, i) => `${i + 1}. [${q.id}] ${q.ask}`).join('\n')}

EVIDENCE FROM LOGS:
${truncatedEvidence}

INSTRUCTIONS:
- Analyze the evidence and answer as many questions as possible
- Be specific and extract exact values (error codes, resource names, IDs)
- If you cannot answer a question, omit it from your response
- Rate your confidence: high (directly stated), medium (inferred), low (educated guess)

Respond in JSON format:
{
  "suggestions": [
    {
      "questionId": "q1",
      "answer": "specific answer extracted from logs",
      "confidence": "high|medium|low",
      "reasoning": "brief explanation of where you found this"
    }
  ]
}`;

    const completion = await this.openai!.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a deployment troubleshooting expert who extracts specific information from logs.' },
        { role: 'user', content: prompt }
      ],
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '2000'),
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    
    return {
      suggestions: (result.suggestions || []).map((s: any) => ({
        questionId: s.questionId,
        question: questions.find(q => q.id === s.questionId)?.ask || '',
        suggestedAnswer: s.answer,
        confidence: s.confidence,
        evidenceRefs: c.evidence.map(e => e.id)
      }))
    };
  }

  private parseStructuredResponse(
    responseText: string,
    questions: Question[]
  ): Array<{
    questionId: string;
    question: string;
    suggestedAnswer: string;
    confidence: string;
    evidenceRefs: string[];
    alternatives?: Array<{ answer: string; confidence: string }>;
    searchInstructions?: string;
  }> {
    const suggestions: Array<{
      questionId: string;
      question: string;
      suggestedAnswer: string;
      confidence: string;
      evidenceRefs: string[];
      alternatives?: Array<{ answer: string; confidence: string }>;
      searchInstructions?: string;
    }> = [];

    // Parse structured text format:
    // QUESTION_ID: q1
    // ANSWER: ...
    // CONFIDENCE: high
    // ALTERNATIVES: ...; ...
    // SEARCH: ...
    
    const blocks = responseText.split(/\\n\\n+/);
    
    for (const block of blocks) {
      const lines = block.split('\\n');
      let questionId = '';
      let answer = '';
      let confidence = 'medium';
      let alternatives: Array<{ answer: string; confidence: string }> = [];
      let searchInstructions = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('QUESTION_ID:')) {
          questionId = trimmed.substring(12).trim();
        } else if (trimmed.startsWith('ANSWER:')) {
          answer = trimmed.substring(7).trim();
        } else if (trimmed.startsWith('CONFIDENCE:')) {
          confidence = trimmed.substring(11).trim().toLowerCase();
        } else if (trimmed.startsWith('ALTERNATIVES:')) {
          const alts = trimmed.substring(13).trim();
          if (alts) {
            alternatives = alts.split(';').map(a => ({
              answer: a.trim(),
              confidence: 'low'
            }));
          }
        } else if (trimmed.startsWith('SEARCH:')) {
          searchInstructions = trimmed.substring(7).trim();
        }
      }
      
      if (questionId && answer) {
        const question = questions.find(q => q.id === questionId);
        if (question) {
          suggestions.push({
            questionId,
            question: question.ask,
            suggestedAnswer: answer,
            confidence,
            evidenceRefs: [],
            alternatives: alternatives.length > 0 ? alternatives : undefined,
            searchInstructions: searchInstructions || undefined
          });
        }
      }
    }
    
    return suggestions;
  }

  private async analyzeWithHeuristics(
    c: Case,
    questions: Question[]
  ): Promise<{
    suggestions: Array<{ 
      questionId: string; 
      question: string; 
      suggestedAnswer: string; 
      confidence: string; 
      evidenceRefs: string[];
      alternatives?: Array<{ answer: string; confidence: string }>;
      searchInstructions?: string;
    }>;
  }> {
    // Simple heuristic-based analysis (in real implementation, this would call an LLM)
    const suggestions = [];

    for (const q of questions) {
      let suggestedAnswer = '';
      let confidence = 'low';
      const evidenceRefs: string[] = [];
      const alternatives: Array<{ answer: string; confidence: string }> = [];
      let searchInstructions = '';

      // Extract content from evidence files
      const evidenceContent = await this.loadEvidenceContent(c);

      // Enhanced pattern matching for common questions
      if (q.ask.toLowerCase().includes('error code') || q.ask.toLowerCase().includes('error message')) {
        // Find multiple error patterns
        const errorMatches = new Set<string>();
        const patterns = [
          { regex: /##\[error\]([^\n]{10,200})/gi, label: 'Pipeline Error' },
          { regex: /error[:\s]+([^\n]{10,150})/gi, label: 'General Error' },
          { regex: /failed[:\s]+([^\n]{10,150})/gi, label: 'Failure Message' },
          { regex: /exception[:\s]+([^\n]{10,150})/gi, label: 'Exception' },
          { regex: /DeploymentFailed[^\n]*/gi, label: 'Deployment Error' }
        ];
        
        for (const { regex, label } of patterns) {
          let match;
          while ((match = regex.exec(evidenceContent)) !== null) {
            const errorMsg = match[0].trim().substring(0, 150);
            if (!errorMatches.has(errorMsg)) {
              errorMatches.add(errorMsg);
              if (!suggestedAnswer) {
                suggestedAnswer = errorMsg;
                confidence = 'medium';
              } else {
                alternatives.push({
                  answer: errorMsg,
                  confidence: 'medium'
                });
              }
            }
            if (errorMatches.size >= 4) break; // Limit to 4 alternatives
          }
          if (errorMatches.size >= 4) break;
        }
        
        searchInstructions = 'Search for "##[error]" in pipeline logs to find deployment errors';
      }

      if (q.ask.toLowerCase().includes('deployment method') || q.ask.toLowerCase().includes('deployment tool')) {
        if (evidenceContent.includes('azure-pipelines')) {
          suggestedAnswer = 'Azure DevOps Pipelines';
          confidence = 'high';
        } else if (evidenceContent.match(/az\s+deployment|az\s+group/)) {
          suggestedAnswer = 'Azure CLI';
          confidence = 'high';
        } else if (evidenceContent.includes('bicep')) {
          suggestedAnswer = 'Bicep';
          confidence = 'high';
        } else if (evidenceContent.includes('terraform')) {
          suggestedAnswer = 'Terraform';
          confidence = 'high';
        }
      }

      if (q.ask.toLowerCase().includes('resource type')) {
        const resourceMatch = evidenceContent.match(/Microsoft\.[\w]+\/[\w]+/g);
        if (resourceMatch && resourceMatch.length > 0) {
          suggestedAnswer = Array.from(new Set(resourceMatch)).slice(0, 5).join(', ');
          confidence = 'high';
        } else {
          // Fallback: detect from context clues
          const contextPatterns = [
            { pattern: /apim|api.*management/i, type: 'Microsoft.ApiManagement/service' },
            { pattern: /app.*service|webapp/i, type: 'Microsoft.Web/sites' },
            { pattern: /function.*app/i, type: 'Microsoft.Web/sites (Function App)' },
            { pattern: /storage.*account/i, type: 'Microsoft.Storage/storageAccounts' },
            { pattern: /key.*vault/i, type: 'Microsoft.KeyVault/vaults' },
            { pattern: /sql.*server|sql.*database/i, type: 'Microsoft.Sql/servers' },
            { pattern: /container.*registry|acr/i, type: 'Microsoft.ContainerRegistry/registries' },
            { pattern: /kubernetes|aks/i, type: 'Microsoft.ContainerService/managedClusters' },
            { pattern: /virtual.*machine|vm/i, type: 'Microsoft.Compute/virtualMachines' },
            { pattern: /app.*gateway/i, type: 'Microsoft.Network/applicationGateways' }
          ];
          
          for (const { pattern, type } of contextPatterns) {
            if (pattern.test(evidenceContent)) {
              suggestedAnswer = type;
              confidence = 'medium';
              break;
            }
          }
        }
      }

      if (q.ask.toLowerCase().includes('subscription') || q.ask.toLowerCase().includes('resource group')) {
        const subMatch = evidenceContent.match(/subscriptions?\/([a-f0-9-]{36})/i);
        const rgMatch = evidenceContent.match(/resourceGroups?\/([-\w]+)/i);
        if (subMatch && rgMatch) {
          suggestedAnswer = `Subscription: [REDACTED], Resource Group: [REDACTED]`;
          confidence = 'high';
        } else if (subMatch) {
          suggestedAnswer = `Subscription: [REDACTED]`;
          confidence = 'high';
        } else if (rgMatch) {
          suggestedAnswer = `Resource Group: [REDACTED]`;
          confidence = 'high';
        } else {
          // Try to find from variable patterns
          const subVarMatch = evidenceContent.match(/SubscriptionId[:\s]*\$?\[?[^\]]+\]?/i);
          const rgVarMatch = evidenceContent.match(/ResourceGroup[:\s]*\$?\[?[^\]]+\]?/i);
          if (subVarMatch || rgVarMatch) {
            suggestedAnswer = 'Found in pipeline variables [REDACTED for security]';
            confidence = 'medium';
          }
        }
        searchInstructions = 'Subscription IDs and Resource Groups are automatically redacted for security';
      }

      if (q.ask.toLowerCase().includes('succeeded before') || q.ask.toLowerCase().includes('worked before')) {
        if (evidenceContent.toLowerCase().includes('first time') || evidenceContent.toLowerCase().includes('initial')) {
          suggestedAnswer = 'No - this appears to be the first deployment attempt';
          confidence = 'low';
        } else if (evidenceContent.toLowerCase().includes('previously') || evidenceContent.toLowerCase().includes('last time')) {
          suggestedAnswer = 'Yes - has worked previously';
          confidence = 'low';
        }
      }

      if (q.ask.toLowerCase().includes('what changed') || q.ask.toLowerCase().includes('what was modified')) {
        const changePatterns = [
          /feature[\w-]*/i,
          /branch[:\s]+([\w\/-]+)/i,
          /commit[:\s]+([a-f0-9]{7,40})/i
        ];
        for (const pattern of changePatterns) {
          const match = evidenceContent.match(pattern);
          if (match) {
            suggestedAnswer = `Changes related to: ${match[0]}`;
            confidence = 'low';
            break;
          }
        }
      }

      if (suggestedAnswer) {
        suggestions.push({
          questionId: q.id,
          question: q.ask,
          suggestedAnswer,
          confidence,
          evidenceRefs: c.evidence.map(e => e.id),
          alternatives: alternatives.length > 0 ? alternatives : undefined,
          searchInstructions: searchInstructions || undefined
        });
      }
    }

    return { suggestions };
  }

  private async loadEvidenceContent(c: Case): Promise<string> {
    let content = '';
    const path = require('path');
    
    for (const evidence of c.evidence) {
      if (evidence.mediaType.startsWith('text/') || evidence.mediaType.includes('yaml')) {
        try {
          // Read actual file content from the stored path
          const casesRoot = path.resolve('./cases');
          const filePath = path.join(casesRoot, c.id, evidence.path);
          
          if (await fs.pathExists(filePath)) {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            content += fileContent + '\n\n';
          } else {
            // Fallback to extracts
            if (evidence.extracts && evidence.extracts.length > 0) {
              content += evidence.extracts.map(e => e.summary).join('\n');
            }
          }
        } catch (e) {
          // Skip if can't read
        }
      }
    }
    return content;
  }

  /**
   * Stream consultation with conversation history (for agent sessions)
   */
  async *consultStream(
    session: AgentSession,
    onThought?: (thought: string) => void
  ): AsyncGenerator<any> {
    // Build prompt from session context
    const prompt = this.buildAgentPrompt(session);
    
    if (this.llmEnabled && this.llmProvider === 'openai' && this.openai) {
      // Use OpenAI streaming API
      const messages = [
        ...session.context.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        {
          role: 'user' as const,
          content: prompt
        }
      ];

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: messages,
        stream: true,
        temperature: 0.7
      });

      let fullResponse = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullResponse += content;
        
        if (onThought) {
          onThought(content);
        }
        
        yield { type: 'chunk', content };
      }

      // Parse final response
      try {
        const parsed = JSON.parse(fullResponse);
        yield { type: 'complete', data: parsed };
      } catch {
        yield { type: 'complete', data: { thought: fullResponse } };
      }
    } else {
      // Non-streaming fallback
      const response = await this.consultWithHistory(session, session.context.conversationHistory);
      yield { type: 'complete', data: response };
    }
  }

  /**
   * Consult with conversation history
   */
  async consultWithHistory(
    session: AgentSession,
    messages: AgentMessage[]
  ): Promise<any> {
    const prompt = this.buildAgentPrompt(session);
    
    if (this.llmEnabled && this.llmProvider === 'openai' && this.openai) {
      const chatMessages = [
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        {
          role: 'user' as const,
          content: prompt
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: chatMessages,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      return JSON.parse(content);
    }

    // Fallback to basic consult
    const caseData = await this.loadCaseFromSession(session);
    return this.consult(caseData, session.profile);
  }

  /**
   * Build prompt for agent from session context
   */
  private buildAgentPrompt(session: AgentSession): string {
    const openQuestions = session.personality.investigationPlan.filter(
      q => !session.context.answeredQuestions.find(aq => aq.id === q.id)
    );

    return `Current Investigation Status:

State: ${session.currentCaseState}
Iteration: ${session.metrics.iterations}/${session.config.maxIterations}

Open Questions (${openQuestions.length}/${session.personality.investigationPlan.length}):
${openQuestions.map(q => `- [${q.id}] ${q.ask}${q.required ? ' (REQUIRED)' : ''}`).join('\n')}

Evidence Available: ${session.context.evidence.length} files
Answered Questions: ${session.context.answeredQuestions.length}
Hypotheses: ${session.context.hypotheses.length}

Based on available evidence and current state, what is the next action?

Response format:
{
  "thought": "your reasoning process",
  "action": {
    "type": "answer-question|test-hypothesis|request-evidence|transition-state",
    "payload": { /* action-specific data */ }
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "evidenceRefs": ["evidence-id-1", "evidence-id-2"]
}`;
  }

  /**
   * Load case data from session
   */
  private async loadCaseFromSession(session: AgentSession): Promise<Case> {
    // Reconstruct minimal case object from session
    return {
      id: session.caseId,
      principlesVersion: '1.0.0',
      title: 'Case from agent session',
      state: session.currentCaseState,
      formal: { expected: '', actual: '' },
      hypotheses: session.context.hypotheses,
      questions: [...session.context.answeredQuestions, ...session.personality.investigationPlan],
      evidence: session.context.evidence,
      events: [],
      unknowns: [],
      specialistProfile: session.profile
    };
  }
}

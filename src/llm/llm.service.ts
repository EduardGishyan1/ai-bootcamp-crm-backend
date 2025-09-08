// src/llm/llm.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class LlmService {
  private host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  private model = process.env.OLLAMA_MODEL || 'llama3.1';

  /**
   * Generate a response from the local Ollama model.
   *
   * @param prompt - The main user/content prompt
   * @param temperature - Controls randomness (0.0 = deterministic, 1.0 = creative)
   * @param system - Optional system instruction (role/context for the model)
   */
  async generate(prompt: string, temperature = 0.3, system?: string): Promise<string> {
    const body: Record<string, any> = {
      model: this.model,
      prompt,
      stream: false,
      options: { temperature },
    };

    if (system) {
      body.system = system;
    }

    const res = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const text = (data.response ?? '').trim();

    // Strip unnecessary wrapping quotes/backticks if present
    return text.replace(/^["'`]+|["'`]+$/g, '').trim();
  }
}

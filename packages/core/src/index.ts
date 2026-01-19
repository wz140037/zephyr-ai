export interface Prompt {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function createPrompt(content: string): Prompt {
  return {
    role: 'user',
    content
  }
}

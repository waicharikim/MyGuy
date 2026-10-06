export interface PaLinkRequest {
  code: string;
  command: string;
  expiresAt: string;
}

export interface PaConversationMessage {
  id: string;
  type: 'user' | 'ai';
  message: string;
  timestamp: string;
}

export interface PaChatReply {
  reply: string;
  threadId: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/pa${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Shauri request failed (${response.status}).`;
    try {
      const body = await response.json() as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(' ');
      else if (body.message) message = body.message;
    } catch {
      // Keep the explicit HTTP failure when the response is not JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const shauriApi = {
  session: () => request<{ linked: boolean }>('/session'),
  createLink: () => request<PaLinkRequest>('/link', { method: 'POST' }),
  linkStatus: () => request<{ state: 'not_started' | 'pending' | 'expired' | 'linked' }>('/link/status'),
  logout: () => request<{ linked: false }>('/logout', { method: 'POST' }),
  sendMessage: (message: string) => request<PaChatReply>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  }),
  threadMessages: (threadId: string) => request<{ messages: PaConversationMessage[] }>(
    `/threads/${encodeURIComponent(threadId)}/messages`,
  ),
};

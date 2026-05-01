/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface MediaItem {
  id: string;
  messageId: number;
  type: 'photo' | 'document';
  url: string;
  date: number;
  caption?: string;
}

export class TelegramService {
  private config: TelegramConfig;
  private baseUrl: string;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.baseUrl = `https://api.telegram.org/bot${config.botToken}`;
  }

  async sendMessage(text: string): Promise<any> {
    return this.fetchApi('sendMessage', {
      chat_id: this.config.chatId,
      text,
    });
  }

  async sendKeepAliveMessage(text: string): Promise<any> {
    const url = `${this.baseUrl}/sendMessage`;
    const body = JSON.stringify({
      chat_id: this.config.chatId,
      text,
    });
    
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    });
  }

  async deleteMessage(messageId: number): Promise<any> {
    return this.fetchApi('deleteMessage', {
      chat_id: this.config.chatId,
      message_id: messageId,
    });
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchApi(method: string, body?: any, retryCount = 0): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/${method}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (response.status === 429 && retryCount < 3) {
        const retryAfter = (data.parameters?.retry_after || 5) * 1000;
        console.warn(`Rate limited. retrying after ${retryAfter}ms`);
        await this.sleep(retryAfter);
        return this.fetchApi(method, body, retryCount + 1);
      }

      if (!data.ok) {
        throw new Error(data.description || 'Telegram API Error');
      }
      return data.result;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message.includes('Failed to fetch')) {
        // Potentially network error, brief retry
        if (retryCount < 2) {
          await this.sleep(1000);
          return this.fetchApi(method, body, retryCount + 1);
        }
      }
      throw error;
    }
  }

  async getFileUrl(fileId: string): Promise<string> {
    const file = await this.fetchApi('getFile', { file_id: fileId });
    return `https://api.telegram.org/file/bot${this.config.botToken}/${file.file_path}`;
  }

  async uploadFile(file: File): Promise<MediaItem> {
    const formData = new FormData();
    formData.append('chat_id', this.config.chatId);
    
    // Check if it's an image to use sendPhoto, otherwise sendDocument
    const isImage = file.type.startsWith('image/');
    const method = isImage ? 'sendPhoto' : 'sendDocument';
    formData.append(isImage ? 'photo' : 'document', file);

    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      body: formData,
    });
    
    if (response.status === 429) {
      const data = await response.json();
      const retryAfter = (data.parameters?.retry_after || 5) * 1000;
      await this.sleep(retryAfter);
      return this.uploadFile(file);
    }

    const data = await response.json();
    if (!data.ok) throw new Error(data.description);

    const message = data.result;
    return this.parseMessage(message);
  }

  private async parseMessage(message: any): Promise<MediaItem> {
    let fileId = '';
    let type: 'photo' | 'document' = 'photo';

    if (message.photo) {
      // Get the highest resolution photo
      fileId = message.photo[message.photo.length - 1].file_id;
      type = 'photo';
    } else if (message.document) {
      fileId = message.document.file_id;
      type = 'document';
    } else {
      throw new Error('Not a media message');
    }

    const url = await this.getFileUrl(fileId);
    return {
      id: fileId,
      messageId: message.message_id,
      type,
      url,
      date: message.date * 1000,
      caption: message.caption,
    };
  }

  /**
   * Deep Scanning: Attempts to find media by iterating backwards through message IDs.
   * This is a "guess and check" strategy since the Bot API doesn't support history listing.
   */
  async scanBackwards(startId: number, count: number = 20, onFound: (item: MediaItem) => void) {
    let currentId = startId;
    let found = 0;
    
    // We stop if we hit 0 or enough items
    while (currentId > 0 && found < count) {
      try {
        // Add a small delay between requests to avoid triggering rate limits
        await this.sleep(400); 

        const message = await this.fetchApi('forwardMessage', {
          chat_id: this.config.chatId, // Forward to self
          from_chat_id: this.config.chatId,
          message_id: currentId,
          disable_notification: true
        });
        
        // If we got a message, try to parse it
        try {
          const item = await this.parseMessage(message);
          onFound(item);
          found++;
        } catch (e) {
          // Not a media message, ignore
        }
        
      } catch (e: any) {
        // If it's a 404/Bad Request (message not found), it's fine, just keep going
        if (e.message && (e.message.includes('not found') || e.message.includes('bad request'))) {
          // Normal skip
        } else {
          // Wait longer on other errors
          console.warn('Scan skip due to error:', e.message);
          await this.sleep(1000);
        }
      }
      currentId--;
    }
  }

  /**
   * Gets the latest message ID by sending a tiny temp message and deleting it.
   */
  async getLatestMessageId(): Promise<number> {
    const msg = await this.fetchApi('sendMessage', {
      chat_id: this.config.chatId,
      text: '🔍 Scanning for media...',
      disable_notification: true
    });
    const id = msg.message_id;
    // Cleanup
    await this.fetchApi('deleteMessage', {
      chat_id: this.config.chatId,
      message_id: id
    });
    return id;
  }
}

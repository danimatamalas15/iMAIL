import axios from 'axios';
import { EmailCredentials } from './AuthService';
import { config } from '../config';

export interface EmailData {
  id: string;
  threadId: string;
  historyId: string;
  snippet: string;
  subject: string;
  from: string;
  bodyText: string;
}

export class EmailService {
  private static baseURL = config.BACKEND_URL;

  /**
   * Obtiene la lista de mensajes con todo su detalle directamente desde el backend.
   */
  static async fetchMessages(credentials: EmailCredentials, maxResults = 10): Promise<EmailData[]> {
    try {
      const res = await axios.post(`${this.baseURL}/api/imap/fetch`, {
        credentials,
        maxResults
      });
      return res.data.messages || [];
    } catch (error) {
      console.error('Error fetching messages from backend:', error);
      return [];
    }
  }

  /**
   * Obtiene un mensaje específico por ID.
   * El nuevo backend devuelve todo en `fetchMessages`, pero si se necesita uno solo, 
   * podemos llamar al fetch y filtrar o el backend puede evolucionar. 
   * Por simplicidad, este método devuelve la lista entera y filtra (temporal).
   */
  static async getMessage(credentials: EmailCredentials, messageId: string): Promise<EmailData | null> {
      // Como el backend nuevo trae todo el body en fetch, no siempre hace falta llamar aquí.
      // Si VoiceAgent lo pide, lo damos de fetch temporalmente o asume que ya lo tiene.
      // Por compatibilidad de arquitectura, vamos a devolver null si no está en un cache,
      // la UI llamará a fetchMessages() entero.
      console.warn("getMessage() directo no se usa en este motor IMAP con Vercel. Usa el devuelto en fetchMessages");
      return null;
  }

  /**
   * Envía un email. Para responder se debe incluir In-Reply-To y References.
   */
  static async sendReply(credentials: EmailCredentials, to: string, subject: string, replyText: string, threadId?: string, messageIdToReply?: string): Promise<string> {
    try {
      const res = await axios.post(`${this.baseURL}/api/smtp/send`, {
        credentials,
        to,
        subject,
        bodyText: replyText,
        replyToMessageId: messageIdToReply
      });
      return res.data.success ? "success" : "Hubo un error indefinido en el servidor de correos.";
    } catch (error: any) {
      console.error('Error sending reply:', error.response?.data || error.message);
      return error.response?.data?.error || error.message || "Error de red";
    }
  }

  /**
   * Envía un email nuevo desde cero.
   */
  static async sendEmail(credentials: EmailCredentials, to: string, subject: string, bodyText: string): Promise<string> {
    try {
      const res = await axios.post(`${this.baseURL}/api/smtp/send`, {
        credentials,
        to,
        subject,
        bodyText
      });
      return res.data.success ? "success" : "Hubo un error indefinido en el servidor de correos.";
    } catch (error: any) {
      console.error('Error sending new email:', error.response?.data || error.message);
      return error.response?.data?.error || error.message || "Error de red";
    }
  }

  /**
   * Marca como leído
   */
  static async markAsRead(credentials: EmailCredentials, messageId: string): Promise<boolean> {
    try {
      const res = await axios.post(`${this.baseURL}/api/imap/markRead`, {
        credentials,
        messageId
      });
      return !!res.data.success;
    } catch (error) {
      console.error('Error marking as read:', error);
      return false;
    }
  }

  /**
   * Mueve a la papelera / Borra
   */
  static async trashMessage(credentials: EmailCredentials, messageId: string): Promise<boolean> {
    try {
      const res = await axios.post(`${this.baseURL}/api/imap/trash`, {
        credentials,
        messageId
      });
      return !!res.data.success;
    } catch (error) {
      console.error('Error trashing message:', error);
      return false;
    }
  }

  /**
   * StartWatch: Se usaba para el Push webhook de gmail. Con IMAP Vercel no hay webhooks, lo simularemos/ignoraremos.
   */
  static async startWatch(credentials: EmailCredentials): Promise<boolean> {
      console.log('Push notifications no son nativas en IMAP Vercel, usando polling local.');
      return true;
  }
}

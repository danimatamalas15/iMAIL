// import messaging from '@react-native-firebase/messaging';
import { VoiceAgent } from '../services/VoiceAgent';
import { AuthService } from '../services/AuthService';
import { EmailService } from '../services/EmailService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class MessagingHandler {
  static async setup() {
    console.log('Firebase Cloud Messaging temporariamente desactivado para prebenir Developer_Error en Sign-In');
  }

  /**
   * Lógica interna cuando llega un push desde la Cloud Function
   */
  private static async handlePush(remoteMessage: any) {
    try {
      const mode = await AsyncStorage.getItem('app_mode') || '1'; // Default: Mode 1 (Inmediato)
      
      if (mode === '2') {
        console.log('El usuario está en Modo 2 (On-demand). No se lee automáticamente.');
        return;
      }

      // 1. Obtener Token
      const credentials = await AuthService.getCredentials();
      if (!credentials) {
        console.log('No credentials found, cannot process mail');
        return;
      }

      // 2. Extraer datos del payload del Push (historyId p. ej.)
      // Para efectos de prototipo, haremos fetch del último mensaje de correo.
      const messages = await EmailService.fetchMessages(credentials, 1);
      if (messages && messages.length > 0) {
        const emailData = messages[0];
        if (emailData) {
           // 3. Ejecutar agente conversacional
           await VoiceAgent.handleIncomingEmail(credentials, emailData);
        }
      }
    } catch (e) {
      console.error('Error handling Background Push', e);
    }
  }
}

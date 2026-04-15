import AsyncStorage from '@react-native-async-storage/async-storage';

export interface EmailCredentials {
  imapUser?: string;
  imapPassword?: string;
  imapHost?: string;
  imapPort?: number;
  imapTls?: boolean;
  
  smtpUser?: string;
  smtpPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}

const CREDENTIALS_KEY = 'imail_custom_credentials';

export class AuthService {
  /**
   * Verifica si hay credenciales guardadas localmente
   */
  static async checkExistingLogin(): Promise<EmailCredentials | null> {
    try {
      const data = await AsyncStorage.getItem(CREDENTIALS_KEY);
      if (data) {
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('Error checking existing login', error);
      return null;
    }
  }

  /**
   * Guarda las credenciales introducidas por el usuario
   */
  static async setCredentials(credentials: EmailCredentials): Promise<boolean> {
    try {
      await AsyncStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
      return true;
    } catch (error) {
      console.error('Error saving credentials', error);
      return false;
    }
  }

  /**
   * Borra las credenciales (Logout)
   */
  static async signOut(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CREDENTIALS_KEY);
    } catch (error) {
      console.error('Error signing out', error);
    }
  }

  /**
   * Devuelve las credenciales. Homólogo a getLocalAccessToken
   */
  static async getCredentials(): Promise<EmailCredentials | null> {
    return await this.checkExistingLogin();
  }
}

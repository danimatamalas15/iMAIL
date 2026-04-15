import axios from 'axios';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || '';

export class AudioServices {
  /**
   * Transcribe audio file using OpenAI Whisper
   * @param fileUri Local URI of the audio file recorded
   */
  static async transcribeAudio(fileUri: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        type: 'audio/m4a', // Make sure to match the recording format
        name: 'audio.m4a',
      } as any);
      formData.append('model', 'whisper-1');
      // Prompt explicitly biases the model to expect these words in Spanish, fixing <1s audio empty/hallucinated outputs
      formData.append('prompt', 'El usuario responderá de forma breve. Posibles palabras: sí, no, claro, vale, enviar, responder, borrar.');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData
      });
      
      const data = await response.json();
      if (!response.ok) {
        console.error('Whisper API Error:', data);
        return '';
      }
      return data.text ? data.text.trim() : '';
    } catch (error) {
      console.error('Error in Whisper transcription:', error);
      return '';
    }
  }

  /**
   * LLM Intent Parser and Response Generator
   * Uses OpenAI GPT to understand yes/no/delete etc and translate context based on original email lang.
   */
  static async analyzeIntentOrGenerateReply(prompt: string, context?: string, mode: 'intent' | 'reply' = 'intent'): Promise<string> {
    try {
      let systemInstruction = "Eres el cerebro de iGmailVoice. El usuario te habla. Responde textualmente.";
      
      if (mode === 'intent') {
        systemInstruction = `
          Clasifica la intención del usuario. 
          Opciones permitidas (DEBES RESPONDER EXCLUSIVAMENTE CON UNA DE ESTAS PALABRAS): 
          "YES", "NO", "DELETE", "READ", "UNKNOWN". 
          Ejemplos: "sí" -> YES, "por supuesto" -> YES, "marcar como leído" -> READ, "borrar" -> DELETE.
        `;
      } else if (mode === 'reply') {
        systemInstruction = `
          El usuario te acaba de dictar una respuesta a un correo. 
          Genera el texto final educado en el MISMO IDIOMA en que está el CORREO ORIGINAL.
          Por ejemplo, si el correo original es en francés y el usuario dictó en español, traduce al francés y dale tono formal/natural.
          Correo original de contexto: "${context}".
          Solo devuelve la respuesta final a enviar, sin comillas adicionales.
        `;
      }

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const content = response.data.choices[0].message.content.trim();
      if (mode === 'intent') {
         // Limpiar puntuación para evitar "YES." en vez de "YES"
         return content.replace(/[^a-zA-Z]/g, '').toUpperCase();
      }
      return content;
    } catch (error) {
      console.error('Error calling LLM:', error);
      return mode === 'intent' ? 'UNKNOWN' : '';
    }
  }

  /**
   * Cleans the text for reading aloud by removing everything after the sign-off / signature.
   */
  static async cleanForReading(rawText: string): Promise<string> {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Eres un filtro de texto. Tu objetivo es limpiar el correo eliminando todas las firmas, datos de contacto repetidos, textos legales, faldones y avisos informativos que haya después del saludo de despedida o del último punto relevante. Devuelve únicamente el contenido puro del correo hasta el saludo final/despedida.' },
          { role: 'user', content: rawText }
        ],
        temperature: 0.1,
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data.choices[0].message.content.trim();
    } catch (e) {
      console.error('Error in cleanForReading', e);
      return rawText;
    }
  }

  /**
   * Formats a dictated email address to a valid email representation
   */
  static async formatEmailAddress(dictatedText: string): Promise<string> {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Convierte el texto dictado por el usuario en una dirección de correo electrónico válida (sin espacios y sustituyendo "arroba", "punto" por sus símbolos correctos). Devuelve ÚNICAMENTE la dirección de correo final, sin explicaciones añadidas.' },
          { role: 'user', content: dictatedText }
        ],
        temperature: 0.1,
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data.choices[0].message.content.trim().toLowerCase();
    } catch (e) {
      console.error('Error in formatEmailAddress', e);
      return dictatedText.toLowerCase().replace(/ arroba /g, '@').replace(/ punto /g, '.').replace(/ /g, '');
    }
  }

  /**
   * Generates Text-to-Speech audio and plays it immediately via expo-speech
   */
  static async speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        Speech.speak(text, {
          language: 'es-ES', // Ajustable por configuración
          onDone: () => resolve(),
          onError: (error) => {
             console.error('Error in expo-speech:', error);
             resolve();
          }
        });
      } catch (error) {
        console.error('Error generating/playing TTS:', error);
        resolve(); // resolve anyway so standard flow continues
      }
    });
  }

  /**
   * Starts recording audio
   */
  static async startRecording(): Promise<Audio.Recording | null> {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      return recording;
    } catch (err) {
      console.error('Failed to start recording', err);
      return null;
    }
  }

  /**
   * Stop recording and get URI
   */
  static async stopRecording(recording: Audio.Recording): Promise<string | null> {
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return recording.getURI();
    } catch (error) {
      console.error('Error stopping recording:', error);
      return null;
    }
  }
}

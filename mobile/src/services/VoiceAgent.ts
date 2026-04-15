import { AudioServices } from './AudioServices';
import { EmailService, EmailData } from './EmailService';
import { EmailCredentials } from './AuthService';
import { PdfExporter } from '../utils/PdfExporter';

export class VoiceAgent {
  /**
   * Orchestrates the entire hands-free flow for a newly received email (Modo 1).
   */
  static async handleIncomingEmail(credentials: EmailCredentials, email: EmailData): Promise<void> {
    const senderName = email.from.split('<')[0].trim() || email.from;

    // --- Paso A: Notificación y Pregunta Inicial ---
    let intentResolvedA = false;
    let finalIntentA = 'NO';
    
    await AudioServices.speak(`CORREO RECIBIDO DE ${senderName}. ¿QUIERES ESCUCHAR EL CORREO?`);

    while (!intentResolvedA) {
      const userIntent = await this.listenAndDetectIntent();
      
      if (userIntent === 'YES') {
        intentResolvedA = true;
        finalIntentA = 'YES';
      } else if (userIntent === 'NO') {
        await AudioServices.speak("EL CORREO QUEDA PENDIENTE DE PROCESAR.");
        return;
      } else {
        await AudioServices.speak("LO SIENTO, NO TE HE ENTENDIDO. POR FAVOR, RESPONDE SÍ O NO PARA ESCUCHAR EL CORREO.");
      }
    }

    // --- Paso B: Lectura de Correo ---
    const cleanEmailBody = await AudioServices.cleanForReading(email.bodyText);
    const readScript = `
      REMITENTE: ${senderName}.
      ASUNTO: ${email.subject}.
      CONTENIDO: ${cleanEmailBody.substring(0, 1000)}
    `;
    await AudioServices.speak(readScript);

    // --- Paso C: Confirmar Respuesta ---
    let wantsToReply = false;
    let intentResolvedC = false;

    await AudioServices.speak("¿QUIERES RESPONDER EL EMAIL?");
    
    while (!intentResolvedC) {
      const replyIntent = await this.listenAndDetectIntent();
      if (replyIntent === 'YES') {
        wantsToReply = true;
        intentResolvedC = true;
      } else if (replyIntent === 'NO') {
        wantsToReply = false;
        intentResolvedC = true;
      } else {
        await AudioServices.speak("LO SIENTO, NO TE HE ENTENDIDO. RESPONDE SÍ O NO PARA RESPONDER AL EMAIL.");
      }
    }
    
    let hasSentReply = false;

    if (wantsToReply) {
      // --- Paso D: Dictar, Confirmar y Enviar Respuesta ---
      await AudioServices.speak("A CONTINUACIÓN, DI EN VOZ ALTA TU RESPUESTA.");
      
      let finalReplyText = '';
      let confirmed = false;

      while (!confirmed) {
        const dictatedText = await this.listenAndTranscribe();
        if (!dictatedText || dictatedText.trim() === '') {
           await AudioServices.speak("NO HE ESCUCHADO BIEN, REPITE TU RESPUESTA.");
           continue;
        }

        // Generate context-aware reply
        const polishedReply = await AudioServices.analyzeIntentOrGenerateReply(dictatedText, email.bodyText, 'reply');
        const readPolishedReply = await AudioServices.cleanForReading(polishedReply);

        await AudioServices.speak(`ESTA ES TU RESPUESTA: ${readPolishedReply}. ¿ES CORRECTO?`);
        
        let confirmationResolved = false;
        while (!confirmationResolved) {
          const confirmIntent = await this.listenAndDetectIntent(5000);

          if (confirmIntent === 'YES') {
            confirmed = true;
            confirmationResolved = true;
            finalReplyText = polishedReply;
          } else if (confirmIntent === 'NO') {
            await AudioServices.speak("ELIMINANDO EL TEXTO PREVIO. REPITE TU RESPUESTA.");
            confirmationResolved = true; // Vuelve al bucle principal de dictado
          } else {
            // Ignorado o no entendido (UNKNOWN/TIMEOUT)
            await AudioServices.speak("LO SIENTO, NO TE HE ENTENDIDO. POR FAVOR, RESPONDE SÍ O NO.");
          }
        }
      }

      // Send the email using Gmail API
      const success = await EmailService.sendReply(
        credentials, 
        email.from, 
        email.subject, 
        finalReplyText, 
        email.threadId, 
        email.id
      );

      if (success) {
        await AudioServices.speak("CORREO ENVIADO.");
        hasSentReply = true;
      } else {
        await AudioServices.speak("HUBO UN ERROR AL ENVIAR EL CORREO.");
      }
    } else {
      await AudioServices.speak("PERFECTO, QUEDA PENDIENTE DE RESPUESTA.");
    }

    // --- Paso E: Exportación a PDF ---
    if (hasSentReply) {
      let intentResolvedE = false;
      await AudioServices.speak("¿QUIERES QUE IMPRIMA EL EMAIL ENVIADO?");
      
      while (!intentResolvedE) {
        const wantsToPdf = await this.listenAndDetectIntent();
        if (wantsToPdf === 'YES') {
           await PdfExporter.exportEmailAndReply(email, "Respuesta enviada"); 
           await AudioServices.speak("GUARDADO EN DESCARGAS.");
           intentResolvedE = true;
        } else if (wantsToPdf === 'NO') {
           await AudioServices.speak("GRACIAS.");
           intentResolvedE = true;
        } else {
           await AudioServices.speak("POR FAVOR, RESPONDE SÍ O NO PARA IMPRIMIR EL CORREO.");
        }
      }
    }

    // --- Paso F: Limpieza ---
    let intentResolvedF1 = false;
    await AudioServices.speak("FINALMENTE, ¿QUIERES ELIMINAR EL CORREO?");
    
    while (!intentResolvedF1) {
      const deleteIntent = await this.listenAndDetectIntent();
      if (deleteIntent === 'YES') {
        await EmailService.trashMessage(credentials, email.id);
        await AudioServices.speak("CORREO ELIMINADO. FIN DE LA INTERACCIÓN.");
        return; // Fin
      } else if (deleteIntent === 'NO') {
        intentResolvedF1 = true;
      } else {
        await AudioServices.speak("POR FAVOR, RESPONDE SÍ O NO PARA ELIMINAR EL CORREO.");
      }
    }

    let intentResolvedF2 = false;
    await AudioServices.speak("¿QUIERES MARCAR EL MENSAJE COMO LEÍDO?");
    
    while (!intentResolvedF2) {
      const readIntent = await this.listenAndDetectIntent();
      if (readIntent === 'YES') {
        await EmailService.markAsRead(credentials, email.id);
        await AudioServices.speak("MARCADO COMO LEÍDO. FIN DE LA INTERACCIÓN.");
        intentResolvedF2 = true;
      } else if (readIntent === 'NO') {
        await AudioServices.speak("CORREO MANTENIDO COMO NO LEÍDO. FIN DE LA INTERACCIÓN.");
        intentResolvedF2 = true;
      } else {
        await AudioServices.speak("POR FAVOR, RESPONDE SÍ O NO PARA MARCAR COMO LEÍDO.");
      }
    }
  }

  /**
   * Helper function: Listen for a few seconds max and return intent
   */
  private static async listenAndDetectIntent(timeoutMs = 6000): Promise<'YES' | 'NO' | 'TIMEOUT' | 'UNKNOWN'> {
    const recording = await AudioServices.startRecording();
    if (!recording) return 'UNKNOWN';

    return new Promise((resolve) => {
      setTimeout(async () => {
        const uri = await AudioServices.stopRecording(recording);
        if (uri) {
          const transcribed = await AudioServices.transcribeAudio(uri);
          
          // Limpiar puntuación para comparar fácilmente (quita puntos, comas, interrogaciones)
          const cleanText = transcribed.trim().toLowerCase().replace(/[.,!?¿¡]/g, ' ');
          if (cleanText.trim() === '') return resolve('TIMEOUT');
          
          // Dividir en array de palabras
          const words = cleanText.split(/\s+/);
          
          const yesWords = ['si', 'sí', 'yes', 'claro', 'ok', 'vale', 'por', 'supuesto', 'afirmativo', 'sip', 'sipi', 'adelante'];
          const noWords = ['no', 'nop', 'nunca', 'negativo', 'nopi'];

          const hasYes = words.some(w => yesWords.includes(w));
          const hasNo = words.some(w => noWords.includes(w));
          
          if (hasYes && !hasNo) {
            resolve('YES');
          } else if (hasNo && !hasYes) {
            resolve('NO');
          } else {
             // Fallback a GPT si el usuario dice algo elaborado que el diccionario no pille ("no me interesa", etc)
             const gptIntent = await AudioServices.analyzeIntentOrGenerateReply(transcribed, undefined, 'intent');
             if (gptIntent === 'YES' || gptIntent === 'NO') {
                resolve(gptIntent as any);
             } else {
                resolve('UNKNOWN');
             }
          }
        } else {
          resolve('UNKNOWN');
        }
      }, timeoutMs);
    });
  }

  /**
   * Helper function: Listen and return raw text
   */
  private static async listenAndTranscribe(timeoutMs = 6000): Promise<string> {
    const recording = await AudioServices.startRecording();
    if (!recording) return '';

    return new Promise((resolve) => {
      setTimeout(async () => {
        const uri = await AudioServices.stopRecording(recording);
        if (uri) {
          const transcribed = await AudioServices.transcribeAudio(uri);
          resolve(transcribed);
        } else {
          resolve('');
        }
      }, timeoutMs);
    });
  }

  /**
   * Universal command listener triggered by the FAB
   */
  static async startAssistant(credentials: EmailCredentials, emails: EmailData[]): Promise<void> {
    await AudioServices.speak("¿QUÉ QUIERES HACER?");
    const cmd = await this.listenAndTranscribe(5000);
    const text = cmd.toLowerCase().trim();
    
    if (text.includes("enviar") || text.includes("nuevo")) {
       await this.handleSendNewEmail(credentials);
    } else if (text.includes("leer") || text.includes("escuchar") || text.includes("recibido")) {
       if (emails.length > 0) {
         await this.handleIncomingEmail(credentials, emails[0]);
       } else {
         await AudioServices.speak("NO HAY CORREOS RECIENTES.");
       }
    } else {
       await AudioServices.speak("PROCESO CANCELADO POR ORDEN DESCONOCIDA.");
    }
  }

  /**
   * Flow for sending a brand new email
   */
  static async handleSendNewEmail(credentials: EmailCredentials): Promise<void> {
    let successFlow = false;
    
    while (!successFlow) {
      await AudioServices.speak("CORREO DEL DESTINATARIO.");
      const rawTo = await this.listenAndTranscribe(8000);
      if (!rawTo || rawTo.trim() === '') {
        await AudioServices.speak("NO HE ESCUCHADO EL DESTINATARIO. CANCELANDO.");
        return;
      }
      const toEmail = await AudioServices.formatEmailAddress(rawTo);

      await AudioServices.speak("ASUNTO DEL CORREO.");
      const subject = await this.listenAndTranscribe(8000);

      await AudioServices.speak("CONTENIDO DEL CORREO.");
      const rawBody = await this.listenAndTranscribe(12000);
      
      const cleanReadBody = await AudioServices.cleanForReading(rawBody);

      let confirmationResolved = false;
      while (!confirmationResolved) {
         await AudioServices.speak(`ESTE ES TU CORREO. DESTINATARIO: ${toEmail}. ASUNTO: ${subject}. MENSAJE: ${cleanReadBody}. ¿ES CORRECTO?`);
         
         const confirmIntent = await this.listenAndDetectIntent(5000);
         if (confirmIntent === 'YES') {
            // Sanitize subject and toEmail so they don't break MIME headers with accidental newlines from dictations
            const cleanSubject = subject.replace(/\r?\n|\r/g, ' ').trim();
            const cleanTo = toEmail.replace(/\r?\n|\r/g, '').trim();

            const success = await EmailService.sendEmail(credentials, cleanTo, cleanSubject, rawBody);
            if (success) {
               await AudioServices.speak("CORREO ENVIADO.");
            } else {
               await AudioServices.speak("HUBO UN ERROR AL ENVIAR EL CORREO.");
            }
            confirmationResolved = true;
            successFlow = true;
         } else if (confirmIntent === 'NO') {
            await AudioServices.speak("ELIMINANDO. EMPEZAMOS EL CORREO DE NUEVO.");
            confirmationResolved = true; // Break inner loop, restarts the outer flow
         } else {
            await AudioServices.speak("LO SIENTO, NO TE HE ENTENDIDO. POR FAVOR, RESPONDE SÍ O NO.");
         }
      }
    }
  }
}

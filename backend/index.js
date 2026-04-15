const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.send('<h2>iMAIL Backend is Online (IMAP/SMTP Mode).</h2>');
});

// Helper para conectar a IMAP
const connectImap = (credentials) => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: credentials.imapUser,
      password: credentials.imapPassword,
      host: credentials.imapHost,
      port: credentials.imapPort,
      tls: credentials.imapTls,
      tlsOptions: { rejectUnauthorized: false }, // Ignorar certs auto-firmados si es necesario
      authTimeout: 10000
    });

    imap.once('ready', () => resolve(imap));
    imap.once('error', (err) => reject(err));
    try {
      imap.connect();
    } catch (e) {
      reject(e);
    }
  });
};

// Obtener Lista de Correos y su Contenido
app.post('/api/imap/fetch', async (req, res) => {
  const { credentials, maxResults = 10 } = req.body;
  if (!credentials || !credentials.imapUser) return res.status(400).json({ error: 'Credenciales faltantes' });

  let imap;
  try {
    imap = await connectImap(credentials);
    
    imap.openBox('INBOX', false, (err, box) => {
      if (err) throw err;
      
      const end = box.messages.total;
      if (end === 0) {
        imap.end();
        return res.json({ messages: [] });
      }

      const start = Math.max(1, end - maxResults + 1);
      const fetchReq = imap.seq.fetch(`${start}:${end}`, { bodies: '', struct: true });
      
      const promises = [];
      
      fetchReq.on('message', (msg, seqno) => {
        let msgAttributes = {};
        
        const parsePromise = new Promise((resolveParse) => {
          msg.on('body', (stream, info) => {
            simpleParser(stream, (err, parsed) => {
              if (err) return resolveParse(null);
              resolveParse({ parsed, seqno });
            });
          });
          msg.once('attributes', (attrs) => {
            msgAttributes = attrs;
          });
        });
        
        promises.push(parsePromise.then((result) => {
          if (!result) return null;
          const { parsed } = result;
          
          return {
            id: msgAttributes.uid ? msgAttributes.uid.toString() : seqno.toString(),
            threadId: parsed.messageId || seqno.toString(),
            historyId: seqno.toString(),
            snippet: parsed.text ? parsed.text.replace(/\n/g, ' ').substring(0, 100) : '',
            subject: parsed.subject || 'Sin Asunto',
            from: parsed.from?.text || 'Desconocido',
            bodyText: parsed.text || ''
          };
        }));
      });

      fetchReq.once('error', (err) => {
        imap.end();
        res.status(500).json({ error: err.message });
      });

      fetchReq.once('end', () => {
        Promise.all(promises).then((emails) => {
          imap.end();
          const validEmails = emails.filter(e => e !== null).reverse();
          res.json({ messages: validEmails });
        }).catch(err => {
          imap.end();
          res.status(500).json({ error: err.message });
        });
      });
    });
  } catch (e) {
    if (imap && imap.state !== 'disconnected') imap.end();
    res.status(500).json({ error: e.message || 'Error conectando al IMAP' });
  }
});

// Marcar un correo como leído
app.post('/api/imap/markRead', async (req, res) => {
  const { credentials, messageId } = req.body;
  let imap;
  try {
    imap = await connectImap(credentials);
    imap.openBox('INBOX', false, (err, box) => {
      if (err) throw err;
      imap.addFlags(messageId, ['\\Seen'], (err) => {
        imap.end();
        if (err) throw err;
        res.json({ success: true });
      });
    });
  } catch (e) {
    if (imap && imap.state !== 'disconnected') imap.end();
    res.status(500).json({ error: e.message });
  }
});

// Mover un correo a la papelera (o agregar flag de borrado)
app.post('/api/imap/trash', async (req, res) => {
  const { credentials, messageId } = req.body;
  let imap;
  try {
    imap = await connectImap(credentials);
    imap.openBox('INBOX', false, (err, box) => {
      if (err) throw err;
      imap.addFlags(messageId, ['\\Deleted'], (err) => {
        // La mayoria de servidores IMAP no borran inmediatamente hasta que se cierra/expunge
        imap.closeBox(true, (err) => {
            imap.end();
            if (err) throw err;
            res.json({ success: true });
        });
      });
    });
  } catch (e) {
    if (imap && imap.state !== 'disconnected') imap.end();
    res.status(500).json({ error: e.message });
  }
});

// Enviar Nuevo Email o Responder (SMTP)
app.post('/api/smtp/send', async (req, res) => {
  const { credentials, to, subject, bodyText, replyToMessageId } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      host: credentials.smtpHost,
      port: credentials.smtpPort,
      secure: credentials.smtpSecure, // true for 465, false for other ports
      auth: {
        user: credentials.smtpUser,
        pass: credentials.smtpPassword,
      },
      tls: {
          rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: credentials.smtpUser,
      to: to.replace(/[<>\s"']/g, '').trim(),
      subject: subject,
      text: bodyText
    };

    if (replyToMessageId) {
      mailOptions.inReplyTo = replyToMessageId;
      mailOptions.references = replyToMessageId;
      // Añadir prefijo Re: si no lo tiene
      if(!subject.startsWith('Re:')) mailOptions.subject = 'Re: ' + subject;
    }

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`iMAIL Vercel Backend listening on port ${PORT}`);
});

module.exports = app;

import React, { useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Appbar, List, Card, Avatar, FAB, useTheme, Button, Text, TextInput, Switch } from 'react-native-paper';
import { AuthService, EmailCredentials } from '../services/AuthService';
import { EmailService, EmailData } from '../services/EmailService';

export function HomeScreen({ navigation }: any) {
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<EmailCredentials | null>(null);
  const theme = useTheme();

  // Form State
  const [imapUser, setImapUser] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapTls, setImapTls] = useState(true);
  
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpSecure, setSmtpSecure] = useState(true);

  // Polling trackers
  const lastSeenMessageId = useRef<string | null>(null);
  const isAgentActive = useRef<boolean>(false);

  useEffect(() => {
    AuthService.checkExistingLogin().then(c => {
      setCredentials(c);
      if (c) loadEmails(c);
    });
  }, []);

  const handleSaveCredentials = async () => {
    const newCreds: EmailCredentials = {
      imapUser,
      imapPassword,
      imapHost,
      imapPort: parseInt(imapPort, 10),
      imapTls,
      smtpUser: imapUser,
      smtpPassword: imapPassword,
      smtpHost,
      smtpPort: parseInt(smtpPort, 10),
      smtpSecure
    };
    const saved = await AuthService.setCredentials(newCreds);
    if(saved) {
        setCredentials(newCreds);
        loadEmails(newCreds);
    }
  };

  const handleLogout = async () => {
      await AuthService.signOut();
      setCredentials(null);
  };

  const loadEmails = async (currentCreds: EmailCredentials | null = credentials) => {
    if (!currentCreds) return;
    setLoading(true);
    try {
      // El backend ahora devuelve los correos enteros con fetchMessages
      const messages = await EmailService.fetchMessages(currentCreds, 10);
      
      if (messages.length > 0) {
        const latestMsgId = messages[0].id;
        if (lastSeenMessageId.current && lastSeenMessageId.current !== latestMsgId) {
          // Detectado en carga manual, lanzamos Asistente
          if (!isAgentActive.current) {
            isAgentActive.current = true;
            const newEmailDetails = messages[0];
            const { VoiceAgent } = await import('../services/VoiceAgent');
            await VoiceAgent.handleIncomingEmail(currentCreds, newEmailDetails);
            isAgentActive.current = false;
          }
        }
        lastSeenMessageId.current = latestMsgId;
      }
      setEmails(messages);
    } catch (e) {
      console.error('Failed to load emails', e);
    } finally {
      setLoading(false);
    }
  };

  // Foreground Polling Effect 
  useEffect(() => {
    if (!credentials) return;

    const pollNewEmails = async () => {
      if (isAgentActive.current) return;
      
      try {
        const messages = await EmailService.fetchMessages(credentials, 1);
        
        if (messages.length > 0) {
          const latestMsgId = messages[0].id;
          
          if (lastSeenMessageId.current && lastSeenMessageId.current !== latestMsgId) {
            isAgentActive.current = true;
            lastSeenMessageId.current = latestMsgId;
            
            const newEmailDetails = messages[0];
            loadEmails(credentials); // Refresh visuals
            
            // Trigger Assistant directly
            const { VoiceAgent } = await import('../services/VoiceAgent');
            await VoiceAgent.handleIncomingEmail(credentials, newEmailDetails);
            
            isAgentActive.current = false;
          } else if (!lastSeenMessageId.current) {
             lastSeenMessageId.current = latestMsgId;
          }
        }
      } catch (e) {
        console.warn('Polling check failed', e);
        isAgentActive.current = false;
      }
    };

    const intervalId = setInterval(pollNewEmails, 15000);
    return () => clearInterval(intervalId);
  }, [credentials]);

  if (!credentials) {
    return (
      <View style={styles.centerContainer}>
        <Text variant="titleLarge" style={styles.title}>iMAIL Setup</Text>
        <Text variant="bodyMedium" style={{marginBottom: 10, textAlign: 'center'}}>Introduce tus parámetros de servidor de correo</Text>
        
        <FlatList
          data={[]}
          renderItem={() => <></>}
          ListHeaderComponent={
              <Card style={{padding: 15, width: '100%', marginBottom: 20}}>
                <TextInput label="Email (User)" value={imapUser} onChangeText={setImapUser} autoCapitalize="none" style={styles.input}/>
                <TextInput label="Password" value={imapPassword} onChangeText={setImapPassword} secureTextEntry style={styles.input}/>
                
                <Text style={{marginTop: 10, fontWeight:'bold'}}>IMAP (Entrantes)</Text>
                <TextInput label="IMAP Host (ej: imap.gmail.com)" value={imapHost} onChangeText={setImapHost} autoCapitalize="none" style={styles.input}/>
                <TextInput label="IMAP Port" value={imapPort} onChangeText={setImapPort} keyboardType="numeric" style={styles.input}/>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                    <Text>TLS: </Text>
                    <Switch value={imapTls} onValueChange={setImapTls} />
                </View>

                <Text style={{marginTop: 10, fontWeight:'bold'}}>SMTP (Salientes)</Text>
                <TextInput label="SMTP Host (ej: smtp.gmail.com)" value={smtpHost} onChangeText={setSmtpHost} autoCapitalize="none" style={styles.input}/>
                <TextInput label="SMTP Port" value={smtpPort} onChangeText={setSmtpPort} keyboardType="numeric" style={styles.input}/>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20}}>
                    <Text>Secure (SSL): </Text>
                    <Switch value={smtpSecure} onValueChange={setSmtpSecure} />
                </View>

                <Button mode="contained" onPress={handleSaveCredentials}>Guardar Credenciales</Button>
              </Card>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.Content title="Bandeja de Entrada" />
        <Appbar.Action icon="logout" onPress={handleLogout} />
        <Appbar.Action icon="cog" onPress={() => navigation.navigate('Settings')} />
      </Appbar.Header>

      <FlatList
        data={emails}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadEmails()} />}
        contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <Card 
            style={styles.emailCard} 
            mode="elevated" 
            elevation={2}
            onPress={async () => {
              if (!isAgentActive.current) {
                  isAgentActive.current = true;
                  const { VoiceAgent } = await import('../services/VoiceAgent');
                  await VoiceAgent.handleIncomingEmail(credentials, item);
                  isAgentActive.current = false;
              }
            }}
          >
            <Card.Title
              title={item.from.split('<')[0].trim() || item.from}
              titleStyle={{ fontWeight: 'bold' }}
              subtitle={item.subject}
              subtitleStyle={{ fontWeight: 'bold', color: theme.colors.primary }}
              left={props => <Avatar.Text {...props} label={item.from.charAt(0).toUpperCase()} size={40} />}
            />
            <Card.Content>
              <Text numberOfLines={4} style={{ color: '#444' }}>{item.snippet}</Text>
            </Card.Content>
          </Card>
        )}
      />

      <FAB
        style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
        icon="microphone"
        onPress={async () => {
          if (!isAgentActive.current) {
              isAgentActive.current = true;
              const { VoiceAgent } = await import('../services/VoiceAgent');
              await VoiceAgent.startAssistant(credentials, emails);
              isAgentActive.current = false;
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  centerContainer: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#f9f9f9'},
  title: { marginBottom: 10, fontWeight: 'bold', textAlign: 'center' },
  input: { marginBottom: 10, backgroundColor: 'transparent' },
  fab: { position: 'absolute', margin: 20, right: 10, bottom: 50, transform: [{ scale: 1.3 }] },
  emailCard: { marginBottom: 15, backgroundColor: '#ffffff' },
});

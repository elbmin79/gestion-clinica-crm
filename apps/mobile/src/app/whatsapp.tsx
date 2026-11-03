import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { useEvent } from 'expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import { isWhatsAppReplyWindowOpen } from '../../../../src/lib/whatsapp/reply-window.js';
import { deleteWhatsAppConversation, loadWhatsAppInbox, loadWhatsAppMediaUrl, sendWhatsAppAttachment, sendWhatsAppText, setWhatsAppConversationBlocked, type WhatsAppConversation, type WhatsAppMessage } from '@/lib/whatsapp-api';

export default function WhatsAppScreen() {
  const palette = Colors[useCrmColorScheme()];
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { conversationId: routeConversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [selectedId, setSelectedId] = useState(routeConversationId || '');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [idleNoticeVisible, setIdleNoticeVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingBlock, setChangingBlock] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedImage, setExpandedImage] = useState<{ uri: string; filename: string; mimeType: string; origin: ImageFrame } | null>(null);
  const [downloadingMedia, setDownloadingMedia] = useState(false);
  const imageTransitionProgress = useRef(new Animated.Value(0)).current;
  const historyRef = useRef<ScrollViewInstance>(null);
  const latestMessageIdRef = useRef('');
  const idleNoticeForRef = useRef('');
  const canView = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'whatsapp.view'));
  const canReply = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'whatsapp.reply'));
  const canManage = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'whatsapp.manage'));

  const refresh = useCallback(async (quiet = false) => {
    if (!clinic || !canView) return;
    if (!quiet) setRefreshing(true);
    try {
      const data = await loadWhatsAppInbox(clinic.clinicId, selectedId);
      setConversations(data.conversations);
      setMessages(data.messages);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las conversaciones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clinic, canView, selectedId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setSelectedId(routeConversationId || ''); }, [routeConversationId]);
  useEffect(() => {
    const timer = setInterval(() => void refresh(true), 8000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!selectedId) { latestMessageIdRef.current = ''; return; }
    const latestMessageId = messages.at(-1)?.id || '';
    if (!latestMessageId || latestMessageId === latestMessageIdRef.current) return;
    latestMessageIdRef.current = latestMessageId;
    requestAnimationFrame(() => historyRef.current?.scrollToEnd({ animated: false }));
  }, [messages, selectedId]);

  const visibleConversations = useMemo(() => conversations.filter(item => `${item.contact_name || ''} ${item.contact_phone}`.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX'))), [conversations, query]);
  const selected = conversations.find(item => item.id === selectedId) || null;
  const windowOpen = selected ? isWhatsAppReplyWindowOpen(selected.last_inbound_at) : false;

  useEffect(() => {
    if (!expandedImage) return;
    Animated.spring(imageTransitionProgress, { toValue: 1, damping: 25, stiffness: 220, mass: 0.8, useNativeDriver: false }).start();
  }, [expandedImage, imageTransitionProgress]);

  const closeExpandedImage = () => {
    if (!expandedImage) return;
    Animated.spring(imageTransitionProgress, { toValue: 0, damping: 25, stiffness: 220, mass: 0.8, useNativeDriver: false }).start(({ finished }) => {
      if (finished) setExpandedImage(null);
    });
  };

  useEffect(() => {
    if (!selected || !selectedId || idleNoticeForRef.current === selectedId) return;
    idleNoticeForRef.current = selectedId;
    const lastActivity = Date.parse(selected.last_message_at || '');
    setIdleNoticeVisible(Number.isFinite(lastActivity) && Date.now() - lastActivity >= 60 * 60 * 1000);
    setWriting(false);
  }, [selected, selectedId]);

  const pickAttachment = async () => {
    setError(''); setNotice('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'video/mp4', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/3gpp'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled) setAttachment(result.assets[0] || null);
    } catch {
      setError('No se pudo abrir el selector de archivos.');
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!clinic || !selected || !canReply || !windowOpen || selected.blocked_at || (!body && !attachment) || sending) return;
    if (attachment && attachment.mimeType?.startsWith('video/') && body) {
      setError('WhatsApp no permite texto junto con video. Envía el texto aparte o borra el texto antes de enviar el video.');
      return;
    }
    setSending(true); setError(''); setNotice('');
    try {
      if (attachment) await sendWhatsAppAttachment(clinic.clinicId, selected.id, body, attachment);
      else await sendWhatsAppText(clinic.clinicId, selected.id, body);
      setDraft(''); setAttachment(null);
      setNotice(attachment ? 'Archivo enviado.' : 'Mensaje enviado.');
      await refresh(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo enviar el mensaje.');
    } finally { setSending(false); }
  };

  const changeBlockState = async () => {
    if (!clinic || !selected || !canManage || changingBlock) return;
    const shouldBlock = !selected.blocked_at;
    setChangingBlock(true); setError(''); setNotice('');
    try {
      const result = await setWhatsAppConversationBlocked(clinic.clinicId, selected.id, shouldBlock);
      setConversations(current => current.map(item => item.id === selected.id ? { ...item, blocked_at: result.blockedAt } : item));
      setBlockDialogOpen(false);
      setNotice(shouldBlock ? 'Contacto bloqueado en el CRM.' : 'Contacto desbloqueado en el CRM.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el bloqueo.');
    } finally { setChangingBlock(false); }
  };

  const removeConversation = async () => {
    if (!clinic || !selected || !canManage || deleting) return;
    setDeleting(true); setError('');
    try {
      await deleteWhatsAppConversation(clinic.clinicId, selected.id);
      setDeleteDialogOpen(false);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar la conversación.');
    } finally { setDeleting(false); }
  };

  const downloadMediaFile = async (uri: string, filename: string, mimeType: string) => {
    if (downloadingMedia) return;
    setDownloadingMedia(true);
    try {
      const safeName = sanitizeFilename(filename, mimeType);
      const localMedia = await File.downloadFileAsync(uri, new File(Paths.cache, safeName), { idempotent: true });
      if (Platform.OS === 'android') {
        const initialDirectory = LegacyFileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
        const permission = await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialDirectory);
        if (!permission.granted) return;
        const base64 = await LegacyFileSystem.readAsStringAsync(localMedia.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
        const destination = await LegacyFileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, safeName.replace(/\.[^.]+$/, ''), mimeType || 'application/octet-stream');
        await LegacyFileSystem.StorageAccessFramework.writeAsStringAsync(destination, base64, { encoding: LegacyFileSystem.EncodingType.Base64 });
        Alert.alert('Archivo descargado', `Se guardó ${safeName} en la carpeta elegida.`);
      } else {
        await localMedia.preview({ title: safeName, mimeType });
      }
    } catch {
      Alert.alert('No se pudo descargar', 'Intenta descargar el archivo de nuevo.');
    } finally {
      setDownloadingMedia(false);
    }
  };

  const downloadExpandedImage = async () => {
    if (!expandedImage) return;
    await downloadMediaFile(expandedImage.uri, expandedImage.filename, expandedImage.mimeType);
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!canView) return <Redirect href="/(tabs)/more" />;

  return <SafeAreaView edges={['top', 'bottom']} style={[styles.page, { backgroundColor: palette.background }]}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.content, selected ? styles.threadContent : null]}>
        {selected ? <>
          <View style={[styles.threadHeader, { borderBottomColor: palette.line }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Volver a conversaciones" onPress={() => router.back()} style={styles.backButton}><SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={palette.text} size={21} /></Pressable>
            <View style={styles.threadHeading}><Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>{selected.contact_name || selected.contact_phone}</Text><Text numberOfLines={1} style={[styles.subtitle, { color: palette.textSecondary }]}>{selected.contact_name ? selected.contact_phone : 'WhatsApp'}</Text></View>
            {canManage ? <Pressable accessibilityRole="button" accessibilityLabel="Acciones de la conversación" accessibilityState={{ expanded: actionsOpen }} onPress={() => setActionsOpen(true)} style={styles.headerAction}><SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} tintColor={palette.text} size={23} /></Pressable> : null}
          </View>
          {idleNoticeVisible ? <View accessibilityRole="alert" style={[styles.idleNotice, { backgroundColor: palette.backgroundElement }]}><View style={styles.idleNoticeCopy}><Text style={[styles.idleNoticeTitle, { color: palette.text }]}>{selected.blocked_at ? 'Contacto bloqueado' : windowOpen ? `Puedes responder hasta ${formatTime(new Date(Date.parse(selected.last_inbound_at!) + 24 * 60 * 60 * 1000).toISOString())}` : 'Ventana de respuesta cerrada'}</Text><Text style={[styles.idleNoticeBody, { color: palette.textSecondary }]}>{selected.blocked_at ? 'No puedes enviar mensajes desde la clínica.' : windowOpen ? 'Ha pasado más de 1 hora desde el último mensaje. La ventana de WhatsApp sigue abierta.' : 'Para responder, espera a que el contacto envíe un nuevo mensaje.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso de WhatsApp" onPress={() => setIdleNoticeVisible(false)} style={styles.idleNoticeClose}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={palette.textSecondary} size={16} /></Pressable></View> : null}
          <ScrollView ref={historyRef} style={styles.history} contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled">
            {messages.length ? messages.map(message => <MessageBubble key={message.id} message={message} clinicId={clinic.clinicId} conversationId={selected.id} palette={palette} downloadingMedia={downloadingMedia} onDownloadMedia={(uri, filename, mimeType) => void downloadMediaFile(uri, filename, mimeType)} onExpandImage={(uri, filename, mimeType, origin) => { imageTransitionProgress.setValue(0); setExpandedImage({ uri, filename, mimeType, origin }); }} />) : loading ? <View style={styles.emptyHistory}><ActivityIndicator color={palette.primary} /><Text style={[styles.emptyCopy, { color: palette.textSecondary }]}>Cargando mensajes…</Text></View> : <View style={styles.emptyHistory}><Text style={[styles.emptyCopy, { color: palette.textSecondary }]}>Esta conversación aún no tiene mensajes guardados.</Text></View>}
          </ScrollView>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text> : notice ? <Text accessibilityRole="status" style={[styles.notice, { color: palette.primary }]}>{notice}</Text> : null}
          {canReply && windowOpen && !selected.blocked_at ? (writing ? <View style={styles.composer}>
            {attachment ? <View style={[styles.attachmentChip, { backgroundColor: palette.primarySoft }]}><SymbolView name={{ ios: 'paperclip', android: 'attach_file', web: 'attach_file' }} tintColor={palette.primary} size={15} /><View style={styles.attachmentCopy}><Text numberOfLines={1} style={[styles.attachmentName, { color: palette.text }]}>{attachment.name}</Text><Text style={[styles.attachmentSize, { color: palette.textSecondary }]}>{formatFileSize(attachment.size)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Quitar archivo adjunto" onPress={() => setAttachment(null)} style={styles.removeAttachment}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={palette.textSecondary} size={16} /></Pressable></View> : null}
            <View style={styles.composerRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Adjuntar imagen, video o audio" disabled={sending} onPress={() => void pickAttachment()} style={[styles.attachButton, { opacity: sending ? 0.48 : 1 }]}><SymbolView name={{ ios: 'paperclip', android: 'attach_file', web: 'attach_file' }} tintColor={palette.textSecondary} size={21} /></Pressable>
              <TextInput accessibilityLabel="Escribir mensaje de WhatsApp" value={draft} onChangeText={setDraft} placeholder="Escribe un mensaje" placeholderTextColor={palette.textSecondary} multiline maxLength={4096} blurOnSubmit={false} style={[styles.input, { color: palette.text, backgroundColor: palette.backgroundElement }]} />
              <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" disabled={(!draft.trim() && !attachment) || sending} onPress={() => void send()} style={[styles.sendButton, { backgroundColor: palette.primary, opacity: (!draft.trim() && !attachment) || sending ? 0.48 : 1 }]}>{sending ? <ActivityIndicator color="#fff" /> : <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} tintColor="#fff" size={18} />}</Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setWriting(false); setAttachment(null); }} style={styles.readOnlyToggle}><Text style={[styles.readOnlyToggleText, { color: palette.textSecondary }]}>Volver a solo lectura</Text></Pressable>
          </View> : <Pressable accessibilityRole="button" onPress={() => setWriting(true)} style={styles.startWriting}><SymbolView name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }} tintColor={palette.primary} size={18} /><Text style={[styles.startWritingText, { color: palette.primary }]}>Responder</Text></Pressable>) : <Text style={[styles.readOnlyCopy, { color: palette.textSecondary }]}>{!canReply ? 'Tu rol puede consultar la conversación, pero no enviar respuestas.' : selected.blocked_at ? 'Este contacto está bloqueado en el CRM.' : 'Para responder, espera a que el contacto envíe un nuevo mensaje.'}</Text>}
        </> : <>
          <View style={styles.listHeader}><View style={styles.threadHeading}><Text style={[styles.title, { color: palette.text }]}>WhatsApp</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{conversations.length} {conversations.length === 1 ? 'conversación' : 'conversaciones'}</Text></View>{refreshing ? <ActivityIndicator color={palette.primary} /> : <Pressable accessibilityRole="button" accessibilityLabel="Actualizar conversaciones" onPress={() => void refresh()} style={styles.refreshButton}><SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} tintColor={palette.primary} size={19} /></Pressable>}</View>
          <TextInput accessibilityLabel="Buscar conversaciones" value={query} onChangeText={setQuery} placeholder="Buscar por nombre o teléfono" placeholderTextColor={palette.textSecondary} style={[styles.search, { color: palette.text, backgroundColor: palette.backgroundElement, borderColor: palette.line }]} />
          {error ? <View style={[styles.errorBox, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.error, { color: palette.danger }]}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void refresh()}><Text style={[styles.retry, { color: palette.primary }]}>Intentar de nuevo</Text></Pressable></View> : null}
          <ScrollView style={styles.conversationList} contentContainerStyle={styles.conversationContent}>
            {loading && !conversations.length ? <View style={styles.emptyHistory}><ActivityIndicator color={palette.primary} /><Text style={[styles.emptyCopy, { color: palette.textSecondary }]}>Cargando conversaciones…</Text></View> : visibleConversations.length ? visibleConversations.map(conversation => <ConversationRow key={conversation.id} conversation={conversation} palette={palette} onPress={() => { setError(''); setNotice(''); router.push({ pathname: '/whatsapp/[conversationId]', params: { conversationId: conversation.id } }); }} />) : <View style={[styles.emptyList, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.emptyTitle, { color: palette.text }]}>{query ? 'No encontramos conversaciones' : 'Aún no hay conversaciones'}</Text><Text style={[styles.emptyCopy, { color: palette.textSecondary }]}>{query ? 'Prueba con otro nombre o teléfono.' : 'Los mensajes recibidos en WhatsApp aparecerán aquí.'}</Text></View>}
          </ScrollView>
        </>}
      </View>
      <Modal transparent animationType="fade" visible={actionsOpen} onRequestClose={() => setActionsOpen(false)}>
        <View style={blockStyles.menuScrim}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú" style={StyleSheet.absoluteFill} onPress={() => setActionsOpen(false)} />
          <View style={[blockStyles.menu, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
            <Pressable accessibilityRole="button" onPress={() => { setActionsOpen(false); setBlockDialogOpen(true); }} style={blockStyles.menuItem}><SymbolView name={{ ios: selected?.blocked_at ? 'lock.open' : 'hand.raised.fill', android: selected?.blocked_at ? 'lock_open' : 'block', web: selected?.blocked_at ? 'lock_open' : 'block' }} tintColor={palette.text} size={17} /><Text style={[blockStyles.menuText, { color: palette.text }]}>{selected?.blocked_at ? 'Desbloquear contacto' : 'Bloquear contacto'}</Text></Pressable>
            <View style={[blockStyles.menuDivider, { backgroundColor: palette.line }]} />
            <Pressable accessibilityRole="button" onPress={() => { setActionsOpen(false); setDeleteDialogOpen(true); }} style={blockStyles.menuItem}><SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} tintColor={palette.danger} size={17} /><Text style={[blockStyles.menuText, { color: palette.danger }]}>Eliminar conversación</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal transparent animationType="fade" visible={blockDialogOpen} onRequestClose={() => { if (!changingBlock) setBlockDialogOpen(false); }}>
        <View style={blockStyles.dialogBackdrop}><View style={[blockStyles.blockDialog, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <Text style={[styles.windowTitle, { color: palette.text }]}>{selected?.blocked_at ? '¿Desbloquear este contacto?' : '¿Bloquear este contacto?'}</Text>
          <Text style={[styles.windowCopy, { color: palette.textSecondary }]}>{selected?.blocked_at ? 'La clínica podrá responder de nuevo según los permisos y la ventana de WhatsApp.' : 'Se detendrán los mensajes salientes de la clínica a este contacto. Puedes desbloquearlo después.'}</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
          <View style={blockStyles.dialogActions}><Pressable accessibilityRole="button" disabled={changingBlock} onPress={() => setBlockDialogOpen(false)} style={[blockStyles.dialogCancel, { borderColor: palette.line }]}><Text style={[blockStyles.dialogCancelText, { color: palette.textSecondary }]}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={changingBlock} onPress={() => void changeBlockState()} style={[blockStyles.dialogConfirm, { backgroundColor: selected?.blocked_at ? palette.primary : palette.danger, opacity: changingBlock ? 0.6 : 1 }]}>{changingBlock ? <ActivityIndicator color="#fff" /> : <Text style={blockStyles.dialogConfirmText}>{selected?.blocked_at ? 'Desbloquear' : 'Bloquear contacto'}</Text>}</Pressable></View>
        </View></View>
      </Modal>
      <Modal transparent animationType="fade" visible={deleteDialogOpen} onRequestClose={() => { if (!deleting) setDeleteDialogOpen(false); }}>
        <View style={blockStyles.dialogBackdrop}><View style={[blockStyles.blockDialog, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <Text style={[styles.windowTitle, { color: palette.text }]}>¿Eliminar esta conversación?</Text>
          <Text style={[styles.windowCopy, { color: palette.textSecondary }]}>Se eliminarán del CRM el historial y los archivos guardados de esta conversación. Esta acción no se puede deshacer.</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
          <View style={blockStyles.dialogActions}><Pressable accessibilityRole="button" disabled={deleting} onPress={() => setDeleteDialogOpen(false)} style={[blockStyles.dialogCancel, { borderColor: palette.line }]}><Text style={[blockStyles.dialogCancelText, { color: palette.textSecondary }]}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={deleting} onPress={() => void removeConversation()} style={[blockStyles.dialogConfirm, { backgroundColor: palette.danger, opacity: deleting ? 0.6 : 1 }]}>{deleting ? <ActivityIndicator color="#fff" /> : <Text style={blockStyles.dialogConfirmText}>Eliminar</Text>}</Pressable></View>
        </View></View>
      </Modal>
      <Modal transparent animationType="none" visible={Boolean(expandedImage)} onRequestClose={closeExpandedImage} statusBarTranslucent>
        <View style={styles.imageViewerRoot}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.imageViewerBackdrop, { opacity: imageTransitionProgress }]} />
          {expandedImage ? <Animated.View style={[styles.imageViewerFrame, {
            left: imageTransitionProgress.interpolate({ inputRange: [0, 1], outputRange: [expandedImage.origin.x, 12] }),
            top: imageTransitionProgress.interpolate({ inputRange: [0, 1], outputRange: [expandedImage.origin.y, insets.top + 62] }),
            width: imageTransitionProgress.interpolate({ inputRange: [0, 1], outputRange: [expandedImage.origin.width, Math.max(1, viewportWidth - 24)] }),
            height: imageTransitionProgress.interpolate({ inputRange: [0, 1], outputRange: [expandedImage.origin.height, Math.max(1, viewportHeight - insets.top - insets.bottom - 124)] }),
            borderRadius: imageTransitionProgress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
          }]}>
            <Image accessibilityLabel={expandedImage.filename || 'Imagen compartida por WhatsApp'} contentFit="contain" source={{ uri: expandedImage.uri }} style={styles.expandedImage} />
          </Animated.View> : null}
          <Animated.View pointerEvents="none" style={[styles.imageViewerChatHeader, {
            backgroundColor: palette.background,
            opacity: imageTransitionProgress.interpolate({ inputRange: [0, 0.88, 0.99, 1], outputRange: [1, 1, 0, 0] }),
          }]}>
            <View style={{ height: insets.top }} />
            <View style={[styles.threadHeader, { borderBottomColor: palette.line }]}>
              <View style={styles.backButton}><SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={palette.text} size={21} /></View>
              <View style={styles.threadHeading}><Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>{selected?.contact_name || selected?.contact_phone}</Text><Text numberOfLines={1} style={[styles.subtitle, { color: palette.textSecondary }]}>{selected?.contact_name ? selected.contact_phone : 'WhatsApp'}</Text></View>
              {canManage ? <View style={styles.headerAction}><SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} tintColor={palette.text} size={23} /></View> : null}
            </View>
          </Animated.View>
          <SafeAreaView pointerEvents="box-none" edges={['top', 'bottom']} style={styles.imageViewerControls}>
            <Animated.View style={[styles.imageViewerHeader, { opacity: imageTransitionProgress.interpolate({ inputRange: [0, 0.88, 0.99, 1], outputRange: [0, 0, 1, 1] }) }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar imagen" onPress={closeExpandedImage} style={styles.imageViewerClose}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor="#fff" size={21} /></Pressable>
              <Text numberOfLines={1} style={styles.imageViewerTitle}>{expandedImage?.filename || 'Imagen'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Descargar imagen" disabled={downloadingMedia} onPress={() => void downloadExpandedImage()} style={[styles.imageViewerDownload, { backgroundColor: palette.primary, opacity: downloadingMedia ? 0.6 : 1 }]}>{downloadingMedia ? <ActivityIndicator color="#fff" size="small" /> : <><SymbolView name={{ ios: 'arrow.down.to.line', android: 'download', web: 'download' }} tintColor="#fff" size={16} /><Text style={styles.imageViewerDownloadText}>Descargar</Text></>}</Pressable>
            </Animated.View>
          </SafeAreaView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function ConversationRow({ conversation, palette, onPress }: { conversation: WhatsAppConversation; palette: (typeof Colors)[keyof typeof Colors]; onPress: () => void }) {
  const latest = Array.isArray(conversation.latest_message) ? conversation.latest_message[0] : conversation.latest_message;
  const preview = latest?.body?.trim() || mediaLabel(latest?.media_content_type) || 'Sin mensajes';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir conversación con ${conversation.contact_name || conversation.contact_phone}`} onPress={onPress} style={({ pressed }) => [styles.conversationRow, { backgroundColor: pressed ? palette.backgroundSelected : palette.backgroundElement, borderColor: palette.line }]}>
    <View style={[styles.avatar, { backgroundColor: palette.primarySoft }]}><Text style={[styles.avatarText, { color: palette.primary }]}>{initials(conversation.contact_name || conversation.contact_phone)}</Text></View>
    <View style={styles.conversationMain}><View style={styles.conversationTop}><Text numberOfLines={1} style={[styles.contactName, { color: palette.text }]}>{conversation.contact_name || conversation.contact_phone}</Text><Text style={[styles.timeText, { color: palette.textSecondary }]}>{formatThreadDate(conversation.last_message_at)}</Text></View><Text numberOfLines={1} style={[styles.preview, { color: palette.textSecondary }]}>{preview}</Text><View style={styles.conversationBadges}>{conversation.blocked_at ? <Text style={[styles.badge, { backgroundColor: palette.background, color: palette.danger }]}>Bloqueado</Text> : null}{!isWhatsAppReplyWindowOpen(conversation.last_inbound_at) ? <Text style={[styles.badge, { backgroundColor: palette.background, color: palette.textSecondary }]}>Ventana cerrada</Text> : null}</View></View>
    <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={palette.textSecondary} size={16} />
  </Pressable>;
}

type ImageFrame = { x: number; y: number; width: number; height: number };

function MessageBubble({ message, clinicId, conversationId, palette, onExpandImage, onDownloadMedia, downloadingMedia }: { message: WhatsAppMessage; clinicId: string; conversationId: string; palette: (typeof Colors)[keyof typeof Colors]; onExpandImage: (uri: string, filename: string, mimeType: string, origin: ImageFrame) => void; onDownloadMedia: (uri: string, filename: string, mimeType: string) => void; downloadingMedia: boolean }) {
  const outgoing = message.direction === 'outbound';
  const hasBody = Boolean(message.body?.trim());
  const delivery = outgoing ? deliveryMark(message.delivery_status) : null;
  return <View style={[styles.messageRow, outgoing ? styles.outgoingRow : styles.incomingRow]}>
    <View style={[styles.bubble, message.media_content_type?.startsWith('audio/') ? styles.audioBubble : null, { backgroundColor: outgoing ? palette.primarySoft : palette.backgroundElement }]}>
      {message.media_content_type ? <MediaAttachment message={message} clinicId={clinicId} conversationId={conversationId} palette={palette} outgoing={outgoing} onExpandImage={onExpandImage} onDownloadMedia={onDownloadMedia} downloading={downloadingMedia} /> : null}
      {hasBody ? <Text style={[styles.messageBody, { color: palette.text }]}>{message.body}<Text style={[styles.inlineMessageMeta, { color: palette.textSecondary }]}>  {formatTime(message.created_at)}{delivery ? <Text style={[styles.deliveryMarkText, { color: delivery.color === 'danger' ? palette.danger : delivery.color === 'read' ? palette.primary : palette.textSecondary }]}>  {delivery.mark}</Text> : null}</Text></Text> : <View style={styles.messageFooter}><Text style={[styles.messageTime, { color: palette.textSecondary }]}>{formatTime(message.created_at)}</Text>{delivery ? <Text style={[styles.deliveryMarkText, { color: delivery.color === 'danger' ? palette.danger : delivery.color === 'read' ? palette.primary : palette.textSecondary }]}>{delivery.mark}</Text> : null}</View>}
    </View>
  </View>;
}

function MediaAttachment({ message, clinicId, conversationId, palette, outgoing, onExpandImage, onDownloadMedia, downloading }: { message: WhatsAppMessage; clinicId: string; conversationId: string; palette: (typeof Colors)[keyof typeof Colors]; outgoing: boolean; onExpandImage: (uri: string, filename: string, mimeType: string, origin: ImageFrame) => void; onDownloadMedia: (uri: string, filename: string, mimeType: string) => void; downloading: boolean }) {
  const type = message.media_content_type || '';
  const isImage = type.startsWith('image/');
  const isAudio = type.startsWith('audio/');
  const isVideo = type.startsWith('video/');
  const supported = isImage || isAudio || isVideo;
  const [mediaUrl, setMediaUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const imagePressableRef = useRef<ScrollViewInstance>(null);
  const color = outgoing ? palette.primary : palette.textSecondary;
  const load = useCallback(async (retry = false) => {
    if ((!retry && mediaUrl) || loading || (mediaError && !retry)) return;
    setLoading(true);
    if (retry) setMediaError(false);
    try {
      const result = await loadWhatsAppMediaUrl(clinicId, conversationId, message.id);
      setMediaUrl(result.url);
    } catch {
      setMediaError(true);
    } finally {
      setLoading(false);
    }
  }, [clinicId, conversationId, loading, mediaError, mediaUrl, message.id]);
  const retry = useCallback(() => {
    setMediaError(false);
    setMediaUrl('');
    void load(true);
  }, [load]);

  useEffect(() => {
    if ((!isImage && !isAudio) || !message.media_available) return;
    let active = true;
    setLoading(true);
    void loadWhatsAppMediaUrl(clinicId, conversationId, message.id)
      .then(result => { if (active) setMediaUrl(result.url); })
      .catch(() => { if (active) setMediaError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clinicId, conversationId, isAudio, isImage, message.id, message.media_available]);

  if (!supported) return <Text style={[styles.mediaLabel, { color }]}>{mediaLabel(type)}{message.media_filename ? ` · ${message.media_filename}` : ''}</Text>;
  if (!message.media_available) return <Text style={[styles.mediaLabel, { color }]}>{isImage ? 'Imagen no disponible' : isAudio ? 'Audio no disponible' : 'Video no disponible'}{message.media_filename ? ` · ${message.media_filename}` : ''}</Text>;
  if (mediaError) return <View style={styles.mediaFailure}><Text style={[styles.mediaLabel, { color: palette.danger }]}>{`No se pudo cargar ${isImage ? 'la imagen' : isAudio ? 'el audio' : 'el video'}`}{message.media_filename ? ` · ${message.media_filename}` : ''}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Reintentar ${isImage ? 'imagen' : isAudio ? 'audio' : 'video'}`} onPress={retry} style={[styles.mediaRetry, { backgroundColor: palette.primarySoft }]}><Text style={[styles.mediaRetryText, { color: palette.primary }]}>Reintentar</Text></Pressable></View>;
  if (isImage) return mediaUrl
    ? <Pressable ref={imagePressableRef} accessibilityRole="button" accessibilityLabel={`Ampliar imagen${message.media_filename ? ` ${message.media_filename}` : ''}`} onPress={() => imagePressableRef.current?.measureInWindow((x, y, width, height) => onExpandImage(mediaUrl, message.media_filename || 'Imagen', type, { x, y, width, height }))}><Image accessibilityLabel={message.media_filename || 'Imagen compartida por WhatsApp'} contentFit="contain" source={{ uri: mediaUrl }} style={[styles.mediaImage, { backgroundColor: palette.backgroundElement }]} onError={() => setMediaError(true)} /></Pressable>
    : <Text style={[styles.mediaLabel, { color }]}>{loading ? 'Cargando imagen…' : 'Preparando imagen…'}{message.media_filename ? ` · ${message.media_filename}` : ''}</Text>;
  if (isAudio && !mediaUrl) return <View accessibilityLabel="Cargando audio" style={styles.audioMessage}>
    <View style={[styles.audioButton, { backgroundColor: palette.primary, opacity: 0.55 }]}><SymbolView name={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }} tintColor="#fff" size={17} /></View>
    <View style={styles.audioInfo}><View style={styles.audioWaveform}>{audioWaveform.map((height, index) => <View key={index} style={[styles.audioWaveBar, { height: Math.round(height * 0.28), backgroundColor: palette.textSecondary, opacity: 0.32 }]} />)}</View><View style={styles.audioMeta}><ActivityIndicator color={palette.textSecondary} size="small" /></View></View>
    <View style={[styles.audioDownload, { borderColor: palette.line, opacity: 0.45 }]}><SymbolView name={{ ios: 'arrow.down.to.line', android: 'download', web: 'download' }} tintColor={palette.textSecondary} size={15} /></View>
  </View>;
  if (!mediaUrl) return <Pressable accessibilityRole="button" accessibilityLabel={`${loading ? 'Cargando' : 'Cargar'} ${isAudio ? 'audio' : 'video'}${message.media_filename ? ` ${message.media_filename}` : ''}`} disabled={loading} onPress={() => void load()} style={styles.mediaAction}>
    <View style={[styles.mediaActionIcon, { backgroundColor: palette.primarySoft }]}><SymbolView name={{ ios: isAudio ? 'play.fill' : 'play.rectangle.fill', android: 'play_arrow', web: 'play_arrow' }} tintColor={palette.primary} size={18} /></View>
    <View style={styles.mediaActionCopy}><Text style={[styles.mediaActionTitle, { color: palette.text }]}>{loading ? 'Preparando…' : isAudio ? 'Reproducir audio' : 'Reproducir video'}</Text><Text numberOfLines={1} style={[styles.mediaLabel, { color }]}>{message.media_filename || mediaLabel(type)}</Text></View>
  </Pressable>;
  return isAudio ? <AudioAttachmentPlayer uri={mediaUrl} palette={palette} onRetry={retry} onDownload={() => onDownloadMedia(mediaUrl, message.media_filename || 'audio', type)} downloading={downloading} /> : <VideoAttachmentPlayer uri={mediaUrl} palette={palette} onRetry={retry} />;
}

function AudioAttachmentPlayer({ uri, palette, onRetry, onDownload, downloading }: { uri: string; palette: (typeof Colors)[keyof typeof Colors]; onRetry: () => void; onDownload: () => void; downloading: boolean }) {
  const player = useAudioPlayer(uri, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const progress = status.duration > 0 ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;
  const [waveformWidth, setWaveformWidth] = useState(0);
  const toggle = () => {
    if (!status.isLoaded) return;
    if (status.playing) player.pause();
    else { if (status.didJustFinish) player.seekTo(0); player.play(); }
  };
  if (status.playbackState === 'error') return <MediaRetry label="No se pudo reproducir este audio." onRetry={onRetry} palette={palette} />;
  return <View style={styles.audioMessage}>
    <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pausar audio' : 'Reproducir audio'} disabled={!status.isLoaded} onPress={toggle} style={[styles.audioButton, { backgroundColor: palette.primary, opacity: status.isLoaded ? 1 : 0.65 }]}>
      <SymbolView name={{ ios: status.playing ? 'pause.fill' : 'play.fill', android: status.playing ? 'pause' : 'play_arrow', web: status.playing ? 'pause' : 'play_arrow' }} tintColor="#fff" size={17} />
    </Pressable>
    <View style={styles.audioInfo}>
      <Pressable accessibilityRole="adjustable" accessibilityLabel="Posición del audio" disabled={!status.isLoaded || !status.duration} onLayout={event => setWaveformWidth(event.nativeEvent.layout.width)} onPress={event => { if (waveformWidth > 0 && status.duration > 0) player.seekTo((event.nativeEvent.locationX / waveformWidth) * status.duration); }} style={styles.audioWaveform}>
        {audioWaveform.map((height, index) => <View key={index} style={[styles.audioWaveBar, { height: Math.round(height * 0.28), backgroundColor: (index / audioWaveform.length) * 100 <= progress ? palette.primary : palette.textSecondary, opacity: (index / audioWaveform.length) * 100 <= progress ? 1 : 0.55 }]} />)}
      </Pressable>
      <View style={styles.audioMeta}><Text style={[styles.audioTime, { color: palette.textSecondary }]}>{formatDuration(status.currentTime)}</Text><Text style={[styles.audioTime, { color: palette.textSecondary }]}>{formatDuration(status.duration)}</Text></View>
      {!status.isLoaded && !status.isBuffering ? <Text style={[styles.audioHint, { color: palette.textSecondary }]}>Audio no compatible con este dispositivo</Text> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Descargar audio" disabled={downloading} onPress={onDownload} style={[styles.audioDownload, { borderColor: palette.line, opacity: downloading ? 0.55 : 1 }]}>{downloading ? <ActivityIndicator color={palette.textSecondary} size="small" /> : <SymbolView name={{ ios: 'arrow.down.to.line', android: 'download', web: 'download' }} tintColor={palette.textSecondary} size={15} />}</Pressable>
  </View>;
}

function VideoAttachmentPlayer({ uri, palette, onRetry }: { uri: string; palette: (typeof Colors)[keyof typeof Colors]; onRetry: () => void }) {
  const player = useVideoPlayer(uri);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  if (status === 'error') return <MediaRetry label="No se pudo reproducir este video." onRetry={onRetry} palette={palette} />;
  return <VideoView accessibilityLabel="Video compartido por WhatsApp" contentFit="contain" nativeControls playsInline player={player} style={[styles.mediaVideo, { backgroundColor: palette.backgroundElement }]} />;
}

function MediaRetry({ label, onRetry, palette }: { label: string; onRetry: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={styles.mediaFailure}><Text style={[styles.mediaLabel, { color: palette.danger }]}>{label}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={[styles.mediaRetry, { backgroundColor: palette.primarySoft }]}><Text style={[styles.mediaRetryText, { color: palette.primary }]}>Cargar de nuevo</Text></Pressable></View>;
}

function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es-MX') || 'W'; }
const audioWaveform = [32, 52, 39, 70, 45, 61, 84, 48, 32, 72, 56, 91, 44, 66, 36, 76, 52, 87, 40, 62, 48, 78, 34, 59, 82, 44, 68, 38, 73, 50, 91, 42, 64, 35, 77, 49];
function mediaLabel(type?: string | null) { return type?.startsWith('image/') ? 'Imagen' : type?.startsWith('video/') ? 'Video' : type?.startsWith('audio/') ? 'Audio' : type ? 'Archivo' : ''; }
function sanitizeFilename(filename: string, mimeType: string) {
  const extensionByType: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/3gpp': '.3gp', 'video/mp4': '.mp4' };
  const cleaned = filename.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.+$/, '');
  const fallback = `whatsapp-${mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('video/') ? 'video' : 'image'}${extensionByType[mimeType] || '.jpg'}`;
  if (!cleaned) return fallback;
  return /\.[a-z0-9]{2,5}$/i.test(cleaned) ? cleaned : `${cleaned}${extensionByType[mimeType] || '.jpg'}`;
}
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(date); }
function formatDuration(value: number) { if (!Number.isFinite(value) || value < 0) return '0:00'; return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`; }
function formatFileSize(value?: number) { if (!value || value < 1) return 'Archivo adjunto'; return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`; }
function formatThreadDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'short' }).format(date); }
function deliveryMark(status: string): { mark: string; color: 'muted' | 'read' | 'danger' } {
  if (status === 'failed' || status === 'undelivered' || status === 'canceled') return { mark: '!', color: 'danger' };
  if (status === 'queued' || status === 'sending') return { mark: '◷', color: 'muted' };
  if (status === 'read' || status === 'delivered') return { mark: '✓✓', color: status === 'read' ? 'read' : 'muted' };
  return { mark: '✓', color: 'muted' };
}

const styles = StyleSheet.create({
  page: { flex: 1 }, flex: { flex: 1 }, content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, gap: 10 }, threadContent: { maxWidth: '100%', paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 },
  imageViewerRoot: { flex: 1 }, imageViewerBackdrop: { backgroundColor: '#000' }, imageViewerFrame: { position: 'absolute', overflow: 'hidden', backgroundColor: '#000' }, imageViewerChatHeader: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 1 }, imageViewerControls: { ...StyleSheet.absoluteFill, zIndex: 2 }, imageViewerHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }, imageViewerClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, imageViewerTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff' }, imageViewerDownload: { minHeight: 44, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, imageViewerDownloadText: { color: '#fff', fontSize: 12, fontWeight: '700' }, expandedImage: { width: '100%', height: '100%' },
  listHeader: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 12 }, threadHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth }, threadHeading: { flex: 1, gap: 2 }, title: { fontSize: 21, fontWeight: '700', letterSpacing: -0.3 }, subtitle: { fontSize: 12 }, backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, headerAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, refreshButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, fontSize: 14 }, conversationList: { flex: 1 }, conversationContent: { gap: 7, paddingBottom: 14 }, conversationRow: { minHeight: 76, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 14, fontWeight: '800' }, conversationMain: { flex: 1, gap: 4 }, conversationTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, contactName: { flex: 1, fontSize: 14, fontWeight: '700' }, timeText: { fontSize: 10 }, preview: { fontSize: 12 }, conversationBadges: { flexDirection: 'row', gap: 5 }, badge: { overflow: 'hidden', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: '700' },
  idleNotice: { marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, idleNoticeCopy: { flex: 1, gap: 2 }, idleNoticeTitle: { fontSize: 12, fontWeight: '800' }, idleNoticeBody: { fontSize: 11, lineHeight: 15 }, idleNoticeClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4 },
  windowTitle: { fontSize: 12, fontWeight: '800' }, windowCopy: { fontSize: 11, lineHeight: 16 }, history: { flex: 1 }, messageList: { paddingHorizontal: 11, paddingVertical: 12, gap: 8, flexGrow: 1, justifyContent: 'flex-end' }, messageRow: { width: '100%', flexDirection: 'row' }, outgoingRow: { justifyContent: 'flex-end' }, incomingRow: { justifyContent: 'flex-start' }, bubble: { maxWidth: '88%', minWidth: 92, borderRadius: 16, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 6, gap: 5 }, audioBubble: { width: '88%', paddingHorizontal: 9, paddingTop: 7 }, mediaImage: { width: 220, height: 170, maxWidth: '100%', borderRadius: 10 }, mediaVideo: { width: 220, height: 155, maxWidth: '100%', borderRadius: 10, overflow: 'hidden' }, mediaAction: { minHeight: 44, maxWidth: 230, flexDirection: 'row', alignItems: 'center', gap: 9 }, mediaActionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, mediaActionCopy: { flex: 1, minWidth: 0, gap: 2 }, mediaActionTitle: { fontSize: 13, fontWeight: '700' }, mediaFailure: { maxWidth: 230, gap: 6 }, mediaRetry: { minHeight: 34, alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, mediaRetryText: { fontSize: 12, fontWeight: '700' }, audioMessage: { width: '100%', minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 8 }, audioButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, audioInfo: { flex: 1, minWidth: 0, gap: 2 }, audioMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, audioTime: { fontSize: 9, fontVariant: ['tabular-nums'] }, audioWaveform: { width: '100%', height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 }, audioWaveBar: { width: 3, minWidth: 2, borderRadius: 2 }, audioDownload: { width: 29, height: 29, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, audioHint: { fontSize: 9 }, messageBody: { fontSize: 14, lineHeight: 20 }, inlineMessageMeta: { fontSize: 9, lineHeight: 12, fontVariant: ['tabular-nums'] }, mediaLabel: { fontSize: 12, fontWeight: '700' }, messageFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3 }, messageTime: { fontSize: 9, fontVariant: ['tabular-nums'] }, deliveryMarkText: { fontSize: 10, fontWeight: '700', letterSpacing: -1 }, emptyHistory: { flexGrow: 1, minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 10 }, emptyCopy: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  composer: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, gap: 5 }, composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 }, attachButton: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' }, attachmentChip: { minHeight: 46, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }, attachmentCopy: { flex: 1, minWidth: 0, gap: 1 }, attachmentName: { fontSize: 12, fontWeight: '700' }, attachmentSize: { fontSize: 10 }, removeAttachment: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, minHeight: 44, maxHeight: 116, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' }, sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, startWriting: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, startWritingText: { fontSize: 14, fontWeight: '800' }, readOnlyToggle: { minHeight: 32, alignSelf: 'center', paddingHorizontal: 12, justifyContent: 'center' }, readOnlyToggleText: { fontSize: 12, fontWeight: '700' }, readOnlyCopy: { paddingVertical: 15, paddingHorizontal: 18, fontSize: 12, lineHeight: 17, textAlign: 'center' }, error: { fontSize: 12, lineHeight: 17, marginHorizontal: 12 }, notice: { fontSize: 12, fontWeight: '700', marginHorizontal: 12 }, errorBox: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 7 }, retry: { minHeight: 36, fontSize: 13, fontWeight: '700', textAlignVertical: 'center' }, emptyList: { borderWidth: 1, borderRadius: 15, minHeight: 110, padding: 16, justifyContent: 'center', gap: 4 }, emptyTitle: { fontSize: 15, fontWeight: '700' },
});

const blockStyles = StyleSheet.create({
  menuScrim: { flex: 1, alignItems: 'flex-end', paddingTop: 55, paddingRight: 8, backgroundColor: 'transparent' },
  menu: { minWidth: 236, borderWidth: 0, borderRadius: 14, paddingVertical: 4, overflow: 'hidden', elevation: 0 },
  menuItem: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  menuText: { fontSize: 14, fontWeight: '700' },
  menuDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  dialogBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 22 },
  blockDialog: { width: '100%', maxWidth: 390, borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, paddingTop: 4 },
  dialogCancel: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  dialogCancelText: { fontSize: 13, fontWeight: '700' },
  dialogConfirm: { minHeight: 44, minWidth: 126, borderRadius: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  dialogConfirmText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

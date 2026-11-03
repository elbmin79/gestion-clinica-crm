import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { createClient } from '@/lib/supabase';
import { signatureSvg } from '@/lib/signature-svg.js';
import { useCrmRouter } from '@/lib/use-crm-router';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { useAuth } from '@/providers/auth-provider';
import { profileBirthCountries, profileStaffTypes } from '../../../../src/lib/profile-options.js';

const timeZones = ['America/Tijuana', 'America/Mexico_City', 'America/Hermosillo'];
const profileKeys = ['names', 'firstLastName', 'secondLastName', 'rfc', 'phone', 'specialty', 'university', 'certificationNumber', 'tipoPersonal', 'specialtyCertificationNumber', 'curp', 'paisNacimiento', 'timezone'];
type ProfileForm = Record<(typeof profileKeys)[number] | 'email' | 'newPassword', string>;
type OptionSheetData = { title: string; options: string[]; selected: string; onSelect: (value: string) => void };
type SignaturePoint = { x: number; y: number };
type SignatureStroke = SignaturePoint[];

export default function ProfileScreen() {
  const router = useCrmRouter();
  const palette = Colors[useCrmColorScheme()];
  const { session, loading: authLoading } = useAuth();
  const user = session?.user;
  const client = useMemo(() => createClient(), []);
  const metadata = user?.user_metadata || {};
  const [form, setForm] = useState<ProfileForm>(() => ({
    names: metadata.names || '', firstLastName: metadata.firstLastName || '', secondLastName: metadata.secondLastName || '',
    rfc: metadata.rfc || '', phone: metadata.phone || '', specialty: metadata.specialty || '', university: metadata.university || '',
    certificationNumber: metadata.certificationNumber || '', tipoPersonal: metadata.tipoPersonal || '',
    specialtyCertificationNumber: metadata.specialtyCertificationNumber || '', curp: metadata.curp || '',
    paisNacimiento: metadata.paisNacimiento || '', timezone: metadata.timezone || 'America/Tijuana', email: user?.email || '', newPassword: '',
  }));
  const [avatarUrl, setAvatarUrl] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);
  const [signaturePadWidth, setSignaturePadWidth] = useState(0);
  const [signatureStrokes, setSignatureStrokes] = useState<SignatureStroke[]>([]);
  const [optionSheet, setOptionSheet] = useState<OptionSheetData | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileAction, setFileAction] = useState<'avatar' | 'signature' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!client || !user) return;
    const avatarPath = typeof metadata.avatar_path === 'string' ? metadata.avatar_path : '';
    const signaturePath = typeof metadata.signature_path === 'string' ? metadata.signature_path : '';
    setAvatarUrl(avatarPath ? client.storage.from('profile-avatars').getPublicUrl(avatarPath).data.publicUrl : '');
    if (!signaturePath) { setSignatureUrl(''); return; }
    let active = true;
    void client.storage.from('profile-signatures').createSignedUrl(signaturePath, 3600).then(({ data, error: signedError }) => {
      if (active) setSignatureUrl(signedError ? '' : data?.signedUrl || '');
    });
    return () => { active = false; };
  }, [client, user, metadata.avatar_path, metadata.signature_path]);

  const update = (key: keyof ProfileForm, value: string) => {
    setForm(current => ({ ...current, [key]: key === 'curp' ? value.toLocaleUpperCase('es-MX') : value }));
    setError(''); setNotice('');
  };
  const choose = (key: keyof Pick<ProfileForm, 'timezone' | 'tipoPersonal' | 'paisNacimiento'>, title: string, options: string[]) => {
    setOptionSheet({ title, options, selected: form[key], onSelect: value => update(key, value) });
  };

  const save = async () => {
    if (!client || !user || saving) return;
    const email = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Escribe un correo electrónico válido.'); return; }
    if (form.curp && form.curp.length !== 18) { setError('El CURP debe tener exactamente 18 caracteres.'); return; }
    if (form.newPassword && form.newPassword.length < 8) { setError('La contraseña nueva debe tener al menos 8 caracteres.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const nextMetadata = { ...user.user_metadata, ...Object.fromEntries(profileKeys.map(key => [key, form[key]])) };
      const { error: metadataError } = await client.auth.updateUser({ data: nextMetadata });
      if (metadataError) throw metadataError;
      const emailChanged = email !== (user.email || '');
      if (emailChanged) {
        const { error: emailError } = await client.auth.updateUser({ email });
        if (emailError) throw emailError;
      }
      if (form.newPassword) {
        const { error: passwordError } = await client.auth.updateUser({ password: form.newPassword });
        if (passwordError) throw passwordError;
      }
      setForm(current => ({ ...current, newPassword: '' }));
      setNotice(emailChanged ? 'Perfil actualizado. Confirma el cambio desde el correo enviado.' : 'Perfil actualizado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el perfil.');
    } finally { setSaving(false); }
  };

  const pickImage = async (kind: 'avatar' | 'signature') => {
    if (!client || !user || fileAction) return;
    setError(''); setNotice('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const extension = asset.name.split('.').pop()?.toLocaleLowerCase('en-US') || '';
      const extensions = kind === 'avatar' ? ['jpg', 'jpeg', 'png', 'webp'] : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
      const mimeByExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' };
      const mimeType = mimeByExtension[extension] || asset.mimeType || '';
      const safeExtension = extension || ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[mimeType];
      if (!safeExtension || !extensions.includes(safeExtension)) throw new Error(kind === 'avatar' ? 'Elige una imagen JPG, PNG o WebP.' : 'Elige una imagen JPG, PNG, GIF, WebP o HEIC.');
      const maxBytes = kind === 'avatar' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
      if (!asset.size || asset.size > maxBytes) throw new Error(`La imagen debe pesar menos de ${kind === 'avatar' ? '5' : '10'} MB.`);
      const bytes = await new ExpoFile(asset.uri).arrayBuffer();
      if (bytes.byteLength > maxBytes) throw new Error(`La imagen debe pesar menos de ${kind === 'avatar' ? '5' : '10'} MB.`);
      const bucketName = kind === 'avatar' ? 'profile-avatars' : 'profile-signatures';
      const bucket = client.storage.from(bucketName);
      const path = `${user.id}/${crypto.randomUUID()}.${safeExtension}`;
      setFileAction(kind);
      const { error: uploadError } = await bucket.upload(path, bytes, { contentType: mimeType, cacheControl: kind === 'avatar' ? '31536000' : '3600', upsert: false });
      if (uploadError) throw new Error(kind === 'avatar' ? 'No se pudo subir la foto. Verifica tu conexión e inténtalo otra vez.' : 'No se pudo subir la firma. Verifica tu conexión e inténtalo otra vez.');
      const previousPath = typeof user.user_metadata?.[kind === 'avatar' ? 'avatar_path' : 'signature_path'] === 'string' ? user.user_metadata[kind === 'avatar' ? 'avatar_path' : 'signature_path'] as string : '';
      const metadataKey = kind === 'avatar' ? 'avatar_path' : 'signature_path';
      const { error: updateError } = await client.auth.updateUser({ data: { ...user.user_metadata, [metadataKey]: path } });
      if (updateError) {
        await bucket.remove([path]);
        throw new Error(kind === 'avatar' ? 'La foto se subió, pero no se pudo guardar en tu perfil.' : 'La firma se subió, pero no se pudo guardar en tu perfil.');
      }
      if (kind === 'avatar') setAvatarUrl(bucket.getPublicUrl(path).data.publicUrl);
      else {
        const { data, error: signedError } = await bucket.createSignedUrl(path, 3600);
        if (signedError || !data?.signedUrl) throw new Error('La firma se guardó, pero no se pudo preparar su vista previa.');
        setSignatureUrl(data.signedUrl);
      }
      if (previousPath.startsWith(`${user.id}/`) && previousPath !== path) await bucket.remove([previousPath]);
      setNotice(kind === 'avatar' ? 'Foto de perfil actualizada.' : 'Firma actualizada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la imagen.');
    } finally { setFileAction(null); }
  };

  const removeImage = async (kind: 'avatar' | 'signature') => {
    if (!client || !user || fileAction) return;
    const metadataKey = kind === 'avatar' ? 'avatar_path' : 'signature_path';
    const previousPath = typeof user.user_metadata?.[metadataKey] === 'string' ? user.user_metadata[metadataKey] as string : '';
    if (!previousPath) return;
    setFileAction(kind); setError(''); setNotice('');
    try {
      const { error: updateError } = await client.auth.updateUser({ data: { ...user.user_metadata, [metadataKey]: null } });
      if (updateError) throw updateError;
      if (previousPath.startsWith(`${user.id}/`)) await client.storage.from(kind === 'avatar' ? 'profile-avatars' : 'profile-signatures').remove([previousPath]);
      kind === 'avatar' ? setAvatarUrl('') : setSignatureUrl('');
      setNotice(kind === 'avatar' ? 'Foto de perfil quitada.' : 'Firma quitada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo quitar el archivo.');
    } finally { setFileAction(null); }
  };

  const startSignatureStroke = (x: number, y: number) => {
    if (!signaturePadWidth) return;
    const point = { x: x / signaturePadWidth * 1200, y: y / 180 * 360 };
    setSignatureStrokes(current => [...current, [point]]);
  };
  const extendSignatureStroke = (x: number, y: number) => {
    if (!signaturePadWidth) return;
    const point = { x: x / signaturePadWidth * 1200, y: y / 180 * 360 };
    setSignatureStrokes(current => {
      if (!current.length) return current;
      const next = [...current];
      next[next.length - 1] = [...next[next.length - 1], point];
      return next;
    });
  };
  const saveDrawnSignature = async () => {
    if (!client || !user || !signatureStrokes.length || fileAction) return;
    setFileAction('signature'); setError(''); setNotice('');
    const bucket = client.storage.from('profile-signatures');
    const previousPath = typeof user.user_metadata?.signature_path === 'string' ? user.user_metadata.signature_path : '';
    const path = `${user.id}/${crypto.randomUUID()}.svg`;
    try {
      const svg = signatureSvg(signatureStrokes);
      const bytes = new TextEncoder().encode(svg);
      if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('La firma debe pesar menos de 10 MB.');
      const { error: uploadError } = await bucket.upload(path, bytes.buffer as ArrayBuffer, { contentType: 'image/svg+xml', cacheControl: '3600', upsert: false });
      if (uploadError) throw new Error('No se pudo subir la firma. Verifica tu conexión e inténtalo otra vez.');
      const { data, error: signedError } = await bucket.createSignedUrl(path, 3600);
      if (signedError || !data?.signedUrl) {
        await bucket.remove([path]);
        throw new Error('No se pudo preparar la vista previa de la firma.');
      }
      const { error: updateError } = await client.auth.updateUser({ data: { ...user.user_metadata, signature_path: path } });
      if (updateError) {
        await bucket.remove([path]);
        throw new Error('La firma se subió, pero no se pudo guardar en tu perfil.');
      }
      setSignatureUrl(data.signedUrl);
      if (previousPath.startsWith(`${user.id}/`) && previousPath !== path) await bucket.remove([previousPath]);
      setSignaturePadOpen(false); setSignatureStrokes([]);
      setNotice('Firma dibujada y guardada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la firma.');
    } finally { setFileAction(null); }
  };

  if (authLoading) return null;
  if (!user) return <Redirect href="/" />;

  return <SafeAreaView edges={['top', 'bottom']} style={[styles.page, { backgroundColor: palette.background }]}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View><Text style={[styles.title, { color: palette.text }]}>Mi perfil</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>Información personal y profesional</Text></View></View>
        <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Cuenta</Text>
          <View style={styles.photoRow}>{avatarUrl ? <Image source={{ uri: avatarUrl }} accessibilityLabel="Foto de perfil" contentFit="cover" style={[styles.avatar, { borderColor: palette.line }]} /> : <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: palette.primarySoft, borderColor: palette.line }]}><Text style={[styles.avatarInitial, { color: palette.primary }]}>{form.names.trim().slice(0, 1).toLocaleUpperCase('es-MX') || '?'}</Text></View>}<View style={styles.photoCopy}><Text style={[styles.fieldLabel, { color: palette.text }]}>Foto de perfil</Text><Text style={[styles.hint, { color: palette.textSecondary }]}>JPG, PNG o WebP · Hasta 5 MB</Text><View style={styles.inlineActions}><Action title={fileAction === 'avatar' ? 'Subiendo…' : avatarUrl ? 'Cambiar foto' : 'Agregar foto'} disabled={Boolean(fileAction)} onPress={() => void pickImage('avatar')} palette={palette} />{avatarUrl ? <Action title="Quitar" disabled={Boolean(fileAction)} onPress={() => void removeImage('avatar')} palette={palette} danger /> : null}</View></View></View>
          <Field label="Correo electrónico" value={form.email} onChangeText={value => update('email', value)} keyboardType="email-address" autoCapitalize="none" placeholder="correo@ejemplo.com" palette={palette} />
          <Field label="Contraseña nueva" value={form.newPassword} onChangeText={value => update('newPassword', value)} secureTextEntry autoCapitalize="none" placeholder="Deja en blanco para conservarla" palette={palette} />
          <View style={styles.optionField}><Text style={[styles.fieldLabel, { color: palette.text }]}>Zona horaria</Text><OptionButton value={form.timezone} onPress={() => choose('timezone', 'Zona horaria', timeZones)} palette={palette} /></View>
        </View>
        <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Datos personales</Text>
          <Field label="Nombre(s)" value={form.names} onChangeText={value => update('names', value)} placeholder="Nombre(s)" palette={palette} />
          <View style={styles.fieldRow}><Field label="Primer apellido" value={form.firstLastName} onChangeText={value => update('firstLastName', value)} placeholder="Primer apellido" palette={palette} /><Field label="Segundo apellido" value={form.secondLastName} onChangeText={value => update('secondLastName', value)} placeholder="Segundo apellido" palette={palette} /></View>
          <View style={styles.fieldRow}><Field label="RFC" value={form.rfc} onChangeText={value => update('rfc', value.toLocaleUpperCase('es-MX'))} autoCapitalize="characters" placeholder="RFC" palette={palette} /><Field label="Teléfono" value={form.phone} onChangeText={value => update('phone', value)} keyboardType="phone-pad" placeholder="Teléfono de contacto" palette={palette} /></View>
          <View style={styles.optionField}><Text style={[styles.fieldLabel, { color: palette.text }]}>País de nacimiento</Text><OptionButton value={form.paisNacimiento || 'Sin especificar'} onPress={() => choose('paisNacimiento', 'País de nacimiento', profileBirthCountries)} palette={palette} /></View>
        </View>
        <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Datos profesionales</Text>
          <View style={styles.optionField}><Text style={[styles.fieldLabel, { color: palette.text }]}>Tipo de personal</Text><OptionButton value={form.tipoPersonal || 'Sin especificar'} onPress={() => choose('tipoPersonal', 'Tipo de personal', profileStaffTypes)} palette={palette} /></View>
          <Field label="Especialidad" value={form.specialty} onChangeText={value => update('specialty', value)} placeholder="Ej. Medicina estética" palette={palette} />
          <Field label="Universidad" value={form.university} onChangeText={value => update('university', value)} placeholder="Universidad" palette={palette} />
          <View style={styles.fieldRow}><Field label="Cédula profesional" value={form.certificationNumber} onChangeText={value => update('certificationNumber', value)} placeholder="Número de cédula" palette={palette} /><Field label="Cédula de especialidad" value={form.specialtyCertificationNumber} onChangeText={value => update('specialtyCertificationNumber', value)} placeholder="Número de cédula" palette={palette} /></View>
          <Field label="CURP" value={form.curp} onChangeText={value => update('curp', value)} autoCapitalize="characters" maxLength={18} placeholder="18 caracteres" palette={palette} />
          <View style={styles.signatureRow}>{signatureUrl ? <Image source={{ uri: signatureUrl }} accessibilityLabel="Firma guardada del perfil" contentFit="contain" style={[styles.signatureImage, { backgroundColor: palette.background, borderColor: palette.line }]} /> : <View style={[styles.signatureEmpty, { backgroundColor: palette.background, borderColor: palette.line }]}><Text style={[styles.hint, { color: palette.textSecondary }]}>Aún no has agregado tu firma</Text></View>}<View style={styles.signatureCopy}><Text style={[styles.fieldLabel, { color: palette.text }]}>Firma</Text><Text style={[styles.hint, { color: palette.textSecondary }]}>Imagen o firma dibujada · Hasta 10 MB</Text><View style={styles.inlineActions}><Action title={fileAction === 'signature' ? 'Subiendo…' : signatureUrl ? 'Reemplazar imagen' : 'Subir imagen'} disabled={Boolean(fileAction)} onPress={() => void pickImage('signature')} palette={palette} /><Action title="Firmar a mano" disabled={Boolean(fileAction)} onPress={() => { setError(''); setNotice(''); setSignatureStrokes([]); setSignaturePadOpen(true); }} palette={palette} />{signatureUrl ? <Action title="Quitar" disabled={Boolean(fileAction)} onPress={() => void removeImage('signature')} palette={palette} danger /> : null}</View></View></View>
        </View>
        {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: palette.danger }]}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="status" style={[styles.feedback, { color: palette.primary }]}>{notice}</Text> : null}
        <Pressable accessibilityRole="button" disabled={saving || Boolean(fileAction)} onPress={() => void save()} style={[styles.save, { backgroundColor: palette.primary, opacity: saving || fileAction ? 0.55 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar cambios</Text>}</Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
    <OptionSheet value={optionSheet} onClose={() => setOptionSheet(null)} palette={palette} />
    <Modal transparent animationType="slide" visible={signaturePadOpen} onRequestClose={() => { if (!fileAction) setSignaturePadOpen(false); }}>
      <View style={styles.padBackdrop}><View style={[styles.padSheet, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
        <View style={styles.sheetHeader}><View><Text style={[styles.sectionTitle, { color: palette.text }]}>Firmar a mano</Text><Text style={[styles.hint, { color: palette.textSecondary }]}>Dibuja tu firma con el dedo o un lápiz.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar firma" disabled={Boolean(fileAction)} onPress={() => setSignaturePadOpen(false)} style={styles.padClose}><Text style={[styles.close, { color: palette.textSecondary }]}>×</Text></Pressable></View>
        <View accessibilityRole="image" accessibilityLabel="Área para dibujar la firma" onLayout={event => setSignaturePadWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={() => !fileAction} onMoveShouldSetResponder={() => true} onResponderGrant={event => startSignatureStroke(event.nativeEvent.locationX, event.nativeEvent.locationY)} onResponderMove={event => extendSignatureStroke(event.nativeEvent.locationX, event.nativeEvent.locationY)} style={styles.signatureCanvas}>
          {signatureStrokes.length ? <Image pointerEvents="none" source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(signatureSvg(signatureStrokes))}` }} contentFit="contain" style={StyleSheet.absoluteFill} /> : null}
          {!signatureStrokes.length ? <Text pointerEvents="none" style={styles.canvasHint}>Firma aquí</Text> : null}
        </View>
        {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: palette.danger }]}>{error}</Text> : null}
        <View style={styles.padActions}><Action title="Limpiar" disabled={!signatureStrokes.length || Boolean(fileAction)} onPress={() => setSignatureStrokes([])} palette={palette} /><View style={styles.padSpacer} /><Action title="Cancelar" disabled={Boolean(fileAction)} onPress={() => setSignaturePadOpen(false)} palette={palette} /><Pressable accessibilityRole="button" disabled={!signatureStrokes.length || Boolean(fileAction)} onPress={() => void saveDrawnSignature()} style={[styles.padSave, { backgroundColor: palette.primary, opacity: !signatureStrokes.length || fileAction ? 0.55 : 1 }]}>{fileAction ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar firma</Text>}</Pressable></View>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

function Field({ label, value, onChangeText, placeholder, palette, keyboardType, secureTextEntry, autoCapitalize, maxLength }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; palette: (typeof Colors)[keyof typeof Colors]; keyboardType?: 'email-address' | 'phone-pad'; secureTextEntry?: boolean; autoCapitalize?: 'none' | 'characters' | 'sentences'; maxLength?: number }) {
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize} maxLength={maxLength} autoComplete={secureTextEntry ? 'new-password' : keyboardType === 'email-address' ? 'email' : 'off'} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line }]} /></View>;
}

function OptionButton({ value, onPress, palette }: { value: string; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.optionButton, { backgroundColor: palette.background, borderColor: palette.line }]}><Text numberOfLines={1} style={[styles.optionValue, { color: palette.text }]}>{value}</Text><Text style={{ color: palette.textSecondary, fontSize: 18 }}>⌄</Text></Pressable>;
}

function Action({ title, disabled, onPress, palette, danger }: { title: string; disabled: boolean; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors]; danger?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.smallAction, { borderColor: palette.line, backgroundColor: palette.background, opacity: disabled ? 0.55 : 1 }]}><Text style={[styles.smallActionText, { color: danger ? palette.danger : palette.primary }]}>{title}</Text></Pressable>;
}

function OptionSheet({ value, onClose, palette }: { value: OptionSheetData | null; onClose: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  const [query, setQuery] = useState('');
  useEffect(() => { setQuery(''); }, [value?.title]);
  const visible = (value?.options || []).filter(item => item.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX')));
  return <Modal transparent animationType="slide" visible={Boolean(value)} onRequestClose={onClose}>
    <View style={styles.sheetBackdrop}><View style={[styles.sheet, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
      <View style={styles.sheetHeader}><Text style={[styles.sectionTitle, { color: palette.text }]}>{value?.title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar opciones" onPress={onClose}><Text style={[styles.close, { color: palette.textSecondary }]}>×</Text></Pressable></View>
      <TextInput accessibilityLabel={`Buscar ${value?.title || 'opción'}`} value={query} onChangeText={setQuery} placeholder="Buscar" placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line }]} />
      <FlatList data={visible} keyboardShouldPersistTaps="handled" keyExtractor={item => item} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: value?.selected === item }} onPress={() => { value?.onSelect(item); onClose(); }} style={[styles.optionRow, { borderBottomColor: palette.line, backgroundColor: value?.selected === item ? palette.primarySoft : 'transparent' }]}><Text style={[styles.optionValue, { color: value?.selected === item ? palette.primary : palette.text }]}>{item}</Text>{value?.selected === item ? <Text style={{ color: palette.primary, fontWeight: '800' }}>✓</Text> : null}</Pressable>} ListEmptyComponent={<Text style={[styles.hint, { color: palette.textSecondary }]}>No hay opciones que coincidan.</Text>} />
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, flex: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 3 }, back: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34 }, title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.5 }, subtitle: { fontSize: 13, marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 17, padding: 15, gap: 14 }, sectionTitle: { fontSize: 17, fontWeight: '700' }, photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 66, height: 66, borderWidth: 1, borderRadius: 20 }, avatarEmpty: { alignItems: 'center', justifyContent: 'center' }, avatarInitial: { fontSize: 27, fontWeight: '800' }, photoCopy: { flex: 1, gap: 4 }, inlineActions: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginTop: 3 }, field: { flex: 1, minWidth: 0, gap: 6 }, fieldLabel: { fontSize: 12, fontWeight: '700' }, hint: { fontSize: 11, lineHeight: 16 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, fieldRow: { flexDirection: 'row', gap: 9 }, optionField: { gap: 6 }, optionButton: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, optionValue: { flex: 1, fontSize: 13, fontWeight: '600' }, smallAction: { minHeight: 34, borderWidth: 1, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 10 }, smallActionText: { fontSize: 11, fontWeight: '700' }, signatureRow: { gap: 10 }, signatureImage: { width: '100%', height: 100, borderWidth: 1, borderRadius: 11 }, signatureEmpty: { width: '100%', height: 86, borderWidth: 1, borderStyle: 'dashed', borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, signatureCopy: { gap: 5 }, feedback: { fontSize: 13, lineHeight: 19, paddingHorizontal: 3 }, save: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 }, saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sheetBackdrop: { flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }, sheet: { height: '78%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 16, gap: 12 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, close: { fontSize: 30, paddingHorizontal: 7 }, optionRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  padBackdrop: { flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }, padSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 16, paddingBottom: 26, gap: 14 }, padClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, signatureCanvas: { width: '100%', height: 180, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#d8cbd1', backgroundColor: '#fffdfc', justifyContent: 'center', alignItems: 'center', touchAction: 'none' }, canvasHint: { color: '#8f8388', fontSize: 14 }, padActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, padSpacer: { flex: 1 }, padSave: { minHeight: 44, borderRadius: 11, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
});

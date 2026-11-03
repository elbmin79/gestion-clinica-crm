export async function setConversationBlocked(service, clinicId, conversationId, action, now = () => new Date().toISOString()) {
  if (!['block', 'unblock'].includes(action)) return { error: 'Acción inválida.', status: 400 };
  const blockedAt = action === 'block' ? now() : null;
  const { data, error } = await service.from('clinic_whatsapp_conversations')
    .update({ blocked_at: blockedAt })
    .eq('clinic_id', clinicId).eq('id', conversationId).select('id,blocked_at').maybeSingle();
  if (error) return { error: 'No se pudo actualizar el bloqueo de la conversación.', status: 503 };
  if (!data) return { error: 'No se encontró la conversación.', status: 404 };
  return { blockedAt: data.blocked_at };
}

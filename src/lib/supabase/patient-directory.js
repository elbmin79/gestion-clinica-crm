import { createClient } from './client.js';

const statusToUi = {
  active: 'Activo',
  follow_up: 'Seguimiento',
  new: 'Nuevo',
  inactive: 'Inactivo',
};

const documentStatusToUi = {
  pending: 'Pendiente',
  signed: 'Firmado',
  cancelled: 'Cancelado',
  replaced: 'Reemplazado',
};

const activityTypeToUi = {
  follow_up: 'Seguimiento',
  call: 'Llamada',
  message: 'Mensaje',
  administrative: 'Administrativa',
  other: 'Otro',
};

const activityTypeToDatabase = {
  Seguimiento: 'follow_up',
  Llamada: 'call',
  Mensaje: 'message',
  Administrativa: 'administrative',
  Otro: 'other',
};

const tones = ['violet', 'peach', 'mint', 'blue', 'rose', 'sand'];

function initialsFor(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase('es-MX');
}

function resultError(result, label) {
  if (!result.error) return;
  const error = new Error(label);
  error.cause = result.error;
  throw error;
}

function mapDocument(row) {
  const kind = row.kind === 'contract' ? 'contract' : 'consent';
  return {
    id: row.id,
    diagnosisId: row.diagnosis_id || '',
    title: row.title,
    type: kind === 'contract' ? 'Prestación de servicios' : 'Consentimiento informado',
    contentSnapshot: row.content_snapshot,
    service: row.service || '',
    templateVersion: row.template_version || null,
    createdBy: row.created_by || '',
    signedBy: row.signed_by || '',
    status: documentStatusToUi[row.status] || 'Pendiente',
    requestedAt: row.requested_at,
    signedAt: row.signed_at,
  };
}

async function fetchDirectory(client, clinicId, role) {
  const canReadDiagnoses = ['admin', 'clinician'].includes(role);
  const [patientResult, businessResult, branchResult, providerResult, assignmentResult, diagnosisResult, documentResult, activityResult, templateResult, encounterResult, fileResult, botoxResult] = await Promise.all([
    client.from('patients').select('id, record_number, full_name, email, phone, service_summary, status, primary_branch_id, primary_provider_id, appointment_whatsapp_opt_in, appointment_whatsapp_opt_in_at, appointment_whatsapp_opt_in_source, created_at, updated_at').eq('clinic_id', clinicId).order('created_at', { ascending: false }),
    client.from('businesses').select('id, name, active').eq('clinic_id', clinicId).order('name'),
    client.from('branches').select('id, business_id, name, address, active').eq('clinic_id', clinicId).order('name'),
    client.from('clinic_providers').select(canReadDiagnoses ? 'id, user_id, name, role_title, active' : 'id, name, role_title, active').eq('clinic_id', clinicId).order('name'),
    client.from('provider_branches').select('provider_id, branch_id').eq('clinic_id', clinicId),
    canReadDiagnoses
      ? client.from('patient_diagnoses').select('id, patient_id, summary, status, accepted_at, accepted_by, created_at').eq('clinic_id', clinicId).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    client.from('patient_documents').select('id, patient_id, diagnosis_id, kind, title, service, template_version, content_snapshot, status, requested_at, signed_at, created_by, signed_by').eq('clinic_id', clinicId).order('requested_at', { ascending: false }),
    client.from('patient_activities').select('id, patient_id, activity_type, note, created_at, author_id').eq('clinic_id', clinicId).order('created_at', { ascending: false }),
    client.from('document_templates').select('id, kind, title, category, version, content, active, created_at').eq('clinic_id', clinicId).eq('active', true).order('created_at', { ascending: false }),
    canReadDiagnoses
      ? client.from('patient_encounters').select('id, patient_id, appointment_id, occurred_at, chief_complaint, history, examination, assessment, plan, created_at').eq('clinic_id', clinicId).order('occurred_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    client.from('patient_document_files').select('id, patient_id, kind, title, signed_at, storage_path, mime_type, byte_size, created_at').eq('clinic_id', clinicId).order('created_at', { ascending: false }),
    canReadDiagnoses
      ? client.from('botox_treatment_records').select('id, patient_id, appointment_id, clinician_id, performed_at, product, lot_number, expiration_date, treatment_areas, total_units, follow_up, consent_document_id, consent_file_id, created_at').eq('clinic_id', clinicId).order('performed_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  resultError(patientResult, 'No se pudo cargar el directorio de pacientes.');
  resultError(businessResult, 'No se pudo cargar el catálogo de negocios.');
  resultError(branchResult, 'No se pudo cargar el catálogo de sucursales.');
  resultError(providerResult, 'No se pudo cargar el catálogo de profesionales.');
  resultError(assignmentResult, 'No se pudo cargar la asignación del equipo.');
  resultError(diagnosisResult, 'No se pudo cargar el estado de los diagnósticos.');
  resultError(documentResult, 'No se pudo cargar el historial de documentos.');
  resultError(activityResult, 'No se pudo cargar el historial de seguimiento.');
  resultError(templateResult, 'No se pudieron cargar los formatos de documentos.');
  resultError(encounterResult, 'No se pudo cargar la historia clínica.');
  resultError(fileResult, 'No se pudieron cargar los archivos del expediente.');
  resultError(botoxResult, 'No se pudieron cargar los registros de Botox.');

  const encountersByPatient = new Map();
  for (const row of encounterResult.data || []) {
    encountersByPatient.set(row.patient_id, [...(encountersByPatient.get(row.patient_id) || []), {
      id: row.id, appointmentId: row.appointment_id || '', occurredAt: row.occurred_at,
      chiefComplaint: row.chief_complaint, history: row.history || '', examination: row.examination || '',
      assessment: row.assessment || '', plan: row.plan || '',
    }]);
  }
  const filesByPatient = new Map();
  for (const row of fileResult.data || []) {
    filesByPatient.set(row.patient_id, [...(filesByPatient.get(row.patient_id) || []), {
      id: row.id, kind: row.kind, title: row.title, signedAt: row.signed_at || '',
      storagePath: row.storage_path, mimeType: row.mime_type, byteSize: row.byte_size, createdAt: row.created_at,
    }]);
  }
  const botoxByPatient = new Map();
  for (const row of botoxResult.data || []) {
    botoxByPatient.set(row.patient_id, [...(botoxByPatient.get(row.patient_id) || []), {
      id: row.id, appointmentId: row.appointment_id || '', clinicianId: row.clinician_id || '',
      performedAt: row.performed_at, product: row.product, lotNumber: row.lot_number,
      expirationDate: row.expiration_date || '', treatmentAreas: row.treatment_areas,
      totalUnits: Number(row.total_units), followUp: row.follow_up || '',
      consentDocumentId: row.consent_document_id || '', consentFileId: row.consent_file_id || '', createdAt: row.created_at,
    }]);
  }

  const businesses = businessResult.data || [];
  const branches = branchResult.data || [];
  const providerBranches = new Map();
  for (const assignment of assignmentResult.data || []) {
    providerBranches.set(assignment.provider_id, [...(providerBranches.get(assignment.provider_id) || []), assignment.branch_id]);
  }
  const providers = (providerResult.data || []).map(provider => ({
    id: provider.id,
    name: provider.name,
    role: provider.role_title,
    userId: provider.user_id || '',
    branchIds: providerBranches.get(provider.id) || [],
    initials: initialsFor(provider.name),
    tone: 'lavender',
    active: provider.active,
  }));
  const diagnoses = new Map();
  const diagnosisHistory = new Map();
  for (const diagnosis of diagnosisResult.data || []) {
    const current = diagnoses.get(diagnosis.patient_id);
    if (!current || (diagnosis.status === 'accepted' && current.status !== 'accepted')) diagnoses.set(diagnosis.patient_id, diagnosis);
    const actor = providers.find(provider => provider.userId && provider.userId === diagnosis.accepted_by);
    const actorLabel = actor?.name || (diagnosis.accepted_by ? `Usuario · ${diagnosis.accepted_by}` : 'Sin registro de usuario');
    diagnosisHistory.set(diagnosis.patient_id, [...(diagnosisHistory.get(diagnosis.patient_id) || []), {
      id: diagnosis.id,
      summary: diagnosis.summary,
      status: diagnosis.status,
      acceptedAt: diagnosis.accepted_at || null,
      acceptedBy: diagnosis.accepted_by || '',
      acceptedByLabel: actorLabel,
      createdAt: diagnosis.created_at,
    }]);
  }
  const documents = new Map();
  for (const row of documentResult.data || []) {
    const document = mapDocument(row);
    const creator = providers.find(provider => provider.userId && provider.userId === document.createdBy);
    const signer = providers.find(provider => provider.userId && provider.userId === document.signedBy);
    documents.set(row.patient_id, [...(documents.get(row.patient_id) || []), {
      ...document,
      createdByLabel: document.createdBy ? creator?.name || 'Personal clínico' : '',
      signedByLabel: document.signedBy ? signer?.name || 'Personal clínico' : '',
    }]);
  }
  const patients = (patientResult.data || []).map((row, index) => {
    const branch = branches.find(item => item.id === row.primary_branch_id);
    const provider = providers.find(item => item.id === row.primary_provider_id);
    const patientDocuments = documents.get(row.id) || [];
    const contracts = patientDocuments.filter(item => item.type === 'Prestación de servicios');
    const consents = patientDocuments.filter(item => item.type === 'Consentimiento informado');
    const latestContract = contracts[0];
    const latestConsent = consents[0];
    const diagnosis = diagnoses.get(row.id);
    return {
      id: row.record_number,
      databaseId: row.id,
      name: row.full_name,
      initials: initialsFor(row.full_name),
      treatment: row.service_summary || 'Por definir',
      email: row.email || '',
      phone: row.phone || '',
      whatsappOptIn: row.appointment_whatsapp_opt_in === true,
      whatsappOptInAt: row.appointment_whatsapp_opt_in_at || null,
      whatsappOptInSource: row.appointment_whatsapp_opt_in_source || '',
      branch: branch?.name || 'Sin sucursal asignada',
      branchId: row.primary_branch_id || '',
      clinician: provider?.name || 'Sin profesional asignado',
      providerId: row.primary_provider_id || '',
      status: statusToUi[row.status] || 'Activo',
      contract: latestContract?.status || 'Por preparar',
      contractType: latestContract?.type || '',
      contractTemplateTitle: latestContract?.title || '',
      contractContent: latestContract?.contentSnapshot || '',
      contractService: latestContract?.service || '',
      contractDiagnosisId: latestContract?.diagnosisId || '',
      contractRequestedAt: latestContract?.requestedAt || null,
      contractSignedAt: latestContract?.signedAt || null,
      contractHistory: contracts,
      consent: latestConsent?.status || 'Por preparar',
      consentDocument: latestConsent?.title || '',
      consentContentSnapshot: latestConsent?.contentSnapshot || '',
      consentRequestedAt: latestConsent?.requestedAt || null,
      consentSignedAt: latestConsent?.signedAt || null,
      consentHistory: consents,
      diagnosisAccepted: diagnosis?.status === 'accepted',
      diagnosisId: diagnosis?.id || '',
      diagnosisSummary: diagnosis?.summary || '',
      diagnosisHistory: diagnosisHistory.get(row.id) || [],
      clinicalHistory: encountersByPatient.get(row.id) || [],
      recordFiles: filesByPatient.get(row.id) || [],
      botoxTreatments: botoxByPatient.get(row.id) || [],
      last: index === 0 ? 'Actualizado recientemente' : `Expediente desde ${new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric' }).format(new Date(row.created_at))}`,
      tone: tones[index % tones.length],
    };
  });

  const patientIdsByRecordNumber = new Map(patients.map(patient => [patient.id, patient.databaseId]));
  const activities = (activityResult.data || []).map(activity => {
    const patientId = patients.find(patient => patient.databaseId === activity.patient_id)?.id;
    return {
      id: activity.id,
      databaseId: activity.id,
      patientId: patientId || patientIdsByRecordNumber.get(activity.patient_id) || '',
      type: activityTypeToUi[activity.activity_type] || 'Otro',
      note: activity.note,
      createdAt: activity.created_at,
      author: activity.author_id ? 'Equipo clínico' : 'Equipo clínico',
    };
  }).filter(activity => activity.patientId);

  return {
    patients,
    businesses: businesses.map(item => ({ ...item, active: item.active })),
    branches: branches.map(item => ({ id: item.id, name: item.name, businessId: item.business_id, address: item.address || '', active: item.active })),
    providers,
    activities,
    templates: (templateResult.data || []).map(template => ({
      id: template.id,
      kind: template.kind,
      title: template.title,
      type: template.category,
      content: template.content,
      version: `v${template.version}`,
      uses: 'Formato compartido',
      initials: initialsFor(template.title),
      color: 'blue',
      createdAt: template.created_at,
    })),
  };
}

export function createPatientDirectoryStore({ clientFactory = createClient } = {}) {
  return {
    async load(clinicId, role) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      return fetchDirectory(client, clinicId, role);
    },

    async create(clinicId, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const recordNumber = `PAC-${crypto.randomUUID().slice(0, 8).toLocaleUpperCase('en-US')}`;
      const result = await client.from('patients').insert({
        clinic_id: clinicId,
        record_number: recordNumber,
        full_name: input.name.trim(),
        email: input.email.trim() || null,
        phone: input.phone.trim() || null,
        service_summary: input.treatment.trim() || 'Por definir',
        status: 'new',
        primary_branch_id: input.branchId || null,
        primary_provider_id: input.providerId || null,
      }).select('id, record_number').single();
      resultError(result, 'No se pudo guardar el expediente. Revisa tus permisos y vuelve a intentar.');
      return result.data;
    },

    async update(clinicId, patient, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const status = Object.entries(statusToUi).find(([, label]) => label === input.status)?.[0] || 'active';
      const whatsappOptIn = input.whatsappOptIn === true;
      const result = await client.rpc('update_patient_directory_record', {
        target_clinic_id: clinicId,
        target_patient_id: patient.databaseId,
        target_full_name: input.name.trim(),
        target_email: input.email.trim() || null,
        target_phone: input.phone.trim() || null,
        target_service_summary: input.treatment.trim() || 'Por definir',
        target_branch_id: input.branchId || null,
        target_provider_id: input.providerId || null,
        target_status: status,
        target_whatsapp_opt_in: whatsappOptIn,
        target_whatsapp_opt_in_source: whatsappOptIn ? input.whatsappOptInSource : null,
      });
      resultError(result, 'No se pudo actualizar el expediente ni su autorización de mensajes.');
      return result.data;
    },
    async addActivity(clinicId, patient, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const user = await client.auth.getUser();
      resultError(user, 'No se pudo validar la sesión actual.');
      const result = await client.from('patient_activities').insert({
        clinic_id: clinicId,
        patient_id: patient.databaseId,
        activity_type: activityTypeToDatabase[input.type] || 'other',
        note: input.note.trim(),
        author_id: user.data.user?.id,
      }).select('id').single();
      resultError(result, 'No se pudo guardar la nota. Revisa tus permisos y vuelve a intentar.');
      return result.data;
    },

    async createEncounter(clinicId, patient, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const user = await client.auth.getUser();
      resultError(user, 'No se pudo validar la sesión actual.');
      const result = await client.from('patient_encounters').insert({
        clinic_id: clinicId, patient_id: patient.databaseId, appointment_id: input.appointmentId || null,
        clinician_id: patient.providerId || null, occurred_at: input.occurredAt,
        chief_complaint: input.chiefComplaint.trim(), history: input.history.trim(),
        examination: input.examination.trim(), assessment: input.assessment.trim(), plan: input.plan.trim(),
        created_by: user.data.user?.id,
      }).select('id').single();
      resultError(result, 'No se pudo guardar la consulta. Verifica el esquema y tu rol clínico.');
      return result.data;
    },

    async createBotoxTreatment(clinicId, patient, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const user = await client.auth.getUser();
      resultError(user, 'No se pudo validar la sesión actual.');
      const result = await client.from('botox_treatment_records').insert({
        clinic_id: clinicId, patient_id: patient.databaseId, appointment_id: input.appointmentId || null,
        clinician_id: patient.providerId || null, performed_at: input.performedAt,
        product: input.product.trim(), lot_number: input.lotNumber.trim(),
        expiration_date: input.expirationDate || null, treatment_areas: input.treatmentAreas.trim(),
        total_units: input.totalUnits, follow_up: input.followUp.trim(),
        consent_document_id: input.consentDocumentId || null, consent_file_id: input.consentFileId || null,
        created_by: user.data.user?.id,
      }).select('id').single();
      resultError(result, 'No se pudo guardar el registro de Botox. Revisa tus permisos y vuelve a intentar.');
      return result.data;
    },

    async uploadPatientFile(clinicId, patient, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const id = crypto.randomUUID();
      const extension = input.file.type === 'application/pdf' ? 'pdf' : input.file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${clinicId}/${patient.databaseId}/${id}.${extension}`;
      const upload = await client.storage.from('patient-records').upload(path, input.file, { contentType: input.file.type, upsert: false });
      resultError(upload, 'No se pudo subir el archivo privado del expediente.');
      const user = await client.auth.getUser();
      if (user.error || !user.data.user) {
        await client.storage.from('patient-records').remove([path]);
        if (user.error) resultError(user, 'No se pudo validar la sesión actual.');
        throw new Error('No se pudo validar la sesión actual.');
      }
      const result = await client.from('patient_document_files').insert({
        id, clinic_id: clinicId, patient_id: patient.databaseId, kind: input.kind,
        title: input.title.trim(), signed_at: input.signedAt || null, storage_path: path,
        mime_type: input.file.type, byte_size: input.file.size, uploaded_by: user.data.user.id,
      }).select('id').single();
      if (result.error) {
        await client.storage.from('patient-records').remove([path]);
        resultError(result, 'No se pudo guardar la referencia del archivo.');
      }
      return { id, storagePath: path, title: input.title.trim(), kind: input.kind, signedAt: input.signedAt || '', mimeType: input.file.type, byteSize: input.file.size, createdAt: new Date().toISOString() };
    },

    async openPatientFile(path) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const result = await client.storage.from('patient-records').createSignedUrl(path, 60);
      resultError(result, 'No se pudo abrir el archivo privado.');
      return result.data.signedUrl;
    },

    async createTemplate(clinicId, kind, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const result = await client.rpc('save_clinic_document_template', {
        target_clinic_id: clinicId,
        target_kind: kind,
        target_title: input.title.trim(),
        target_category: input.type?.trim() || (kind === 'contract' ? 'Prestación de servicios' : 'Documento clínico'),
        target_content: input.content.trim(),
      });
      resultError(result, 'No se pudo guardar el formato. Verifica que tengas permisos de administrador.');
      return result.data?.[0] || null;
    },

    async acceptDiagnosis(clinicId, patient, summary) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const user = await client.auth.getUser();
      resultError(user, 'No se pudo validar quién acepta el diagnóstico.');
      const acceptedUser = user.data.user;
      const result = await client.rpc('accept_patient_diagnosis', {
        target_clinic_id: clinicId,
        target_patient_id: patient.databaseId,
        target_summary: summary.trim(),
      });
      resultError(result, 'No se pudo registrar la aceptación del diagnóstico. Revisa tu rol y vuelve a intentar.');
      const accepted = result.data?.[0];
      if (!accepted?.diagnosis_id) throw new Error('La base no devolvió el diagnóstico aceptado.');
      return {
        id: accepted.diagnosis_id,
        acceptedBy: accepted.accepted_by || '',
        acceptedByLabel: acceptedUser?.user_metadata?.full_name || acceptedUser?.email || (accepted.accepted_by ? `Usuario · ${accepted.accepted_by}` : 'Usuario no identificado'),
        supersededDiagnosisCount: accepted.superseded_diagnosis_count || 0,
        replacedContractCount: accepted.replaced_contract_count || 0,
      };
    },

    async createPatientDocument(clinicId, patient, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const user = await client.auth.getUser();
      resultError(user, 'No se pudo validar la sesión actual.');
      const result = await client.rpc('prepare_patient_document', {
        target_clinic_id: clinicId,
        target_patient_id: patient.databaseId,
        target_template_id: input.template.id,
        target_kind: input.kind,
        target_service: input.service || null,
      });
      resultError(result, 'No se pudo preparar el documento. Revisa el formato, el diagnóstico, tu rol y los permisos.');
      const prepared = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!prepared?.document_id) throw new Error('La base no devolvió el documento preparado.');
      return {
        id: prepared.document_id,
        title: prepared.document_title,
        kind: prepared.document_kind,
        service: prepared.document_service || '',
        templateVersion: prepared.document_template_version,
        contentSnapshot: prepared.document_content_snapshot,
        status: prepared.document_status,
        requestedAt: prepared.document_requested_at,
        diagnosisId: prepared.document_diagnosis_id || '',
        createdBy: prepared.document_created_by || '',
        createdByLabel: user.data.user?.user_metadata?.full_name || user.data.user?.email || 'Personal clínico',
      };
    },
    async createBusiness(clinicId, name) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const result = await client.from('businesses').insert({ clinic_id: clinicId, name: name.trim() }).select('id, name, active').single();
      resultError(result, 'No se pudo guardar el negocio. Revisa tus permisos.');
      return result.data;
    },

    async createBranch(clinicId, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const result = await client.from('branches').insert({
        clinic_id: clinicId,
        business_id: input.businessId,
        name: input.name.trim(),
        address: input.address.trim() || null,
      }).select('id, business_id, name, address, active').single();
      resultError(result, 'No se pudo guardar la sucursal. Revisa el negocio seleccionado y tus permisos.');
      return result.data;
    },

    async updateBranch(clinicId, branch, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const result = await client.from('branches').update({ name: input.name.trim(), address: input.address.trim() || null })
        .eq('clinic_id', clinicId).eq('id', branch.id)
        .select('id, business_id, name, address, active').single();
      resultError(result, 'No se pudo actualizar la sucursal. Revisa tus permisos.');
      return result.data;
    },

    async createProvider(clinicId, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const result = await client.from('clinic_providers').insert({
        clinic_id: clinicId,
        name: input.name.trim(),
        role_title: input.role.trim() || 'Profesional',
      }).select('id, name, role_title, active').single();
      resultError(result, 'No se pudo guardar el profesional. Revisa tus permisos de administración.');
      if (input.branchIds.length) {
        const assignments = await client.from('provider_branches').insert(input.branchIds.map(branchId => ({ clinic_id: clinicId, provider_id: result.data.id, branch_id: branchId })));
        if (assignments.error) {
          const rollback = await client.from('clinic_providers').delete().eq('clinic_id', clinicId).eq('id', result.data.id);
          const error = new Error('No se pudo asignar el profesional a las sucursales. El alta se revirtió.');
          error.cause = assignments.error;
          if (rollback.error) error.message = 'El profesional se creó, pero falló la asignación de sucursales y no se pudo revertir. Revisa el equipo.';
          throw error;
        }
      }
      return result.data;
    },

    async updateProvider(clinicId, provider, input) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const uniqueBranchIds = [...new Set(input.branchIds)];
      const priorAssignments = await client.from('provider_branches').select('branch_id').eq('clinic_id', clinicId).eq('provider_id', provider.id);
      resultError(priorAssignments, 'No se pudo revisar la asignación actual del profesional.');
      const updated = await client.from('clinic_providers').update({ name: input.name.trim(), role_title: input.role.trim() || 'Profesional' }).eq('clinic_id', clinicId).eq('id', provider.id).select('id, name, role_title, active').single();
      resultError(updated, 'No se pudo actualizar el profesional. Revisa tus permisos de administración.');
      const removed = await client.from('provider_branches').delete().eq('clinic_id', clinicId).eq('provider_id', provider.id);
      if (removed.error) {
        await client.from('clinic_providers').update({ name: provider.name, role_title: provider.role }).eq('clinic_id', clinicId).eq('id', provider.id);
        resultError(removed, 'No se pudieron actualizar las sucursales del profesional.');
      }
      if (uniqueBranchIds.length) {
        const assignments = await client.from('provider_branches').insert(uniqueBranchIds.map(branchId => ({ clinic_id: clinicId, provider_id: provider.id, branch_id: branchId })));
        if (assignments.error) {
          const restoreAssignments = priorAssignments.data?.length
            ? await client.from('provider_branches').insert(priorAssignments.data.map(row => ({ clinic_id: clinicId, provider_id: provider.id, branch_id: row.branch_id })))
            : { error: null };
          const restoreProvider = await client.from('clinic_providers').update({ name: provider.name, role_title: provider.role }).eq('clinic_id', clinicId).eq('id', provider.id);
          const error = new Error(restoreAssignments.error || restoreProvider.error
            ? 'Falló la asignación y no se pudo restaurar por completo el perfil anterior. Revisa el equipo.'
            : 'No se pudo asignar el profesional a esas sucursales. El cambio se revirtió.');
          error.cause = assignments.error;
          throw error;
        }
      }
      return { ...updated.data, branchIds: uniqueBranchIds };
    },
  };
}

import { fetchReferenceRate } from '@/lib/frankfurter';
import { isLedgerDate } from '@/lib/clinic-expenses';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createServiceClient } from '@/lib/supabase/service-client';

const headers = { 'Cache-Control':'no-store' };
const reply = (data, status = 200) => Response.json(data,{status,headers});

export async function GET(request) {
  const onDate = new URL(request.url).searchParams.get('date') || '';
  if (onDate && !isLedgerDate(onDate)) return reply({error:'Fecha inválida.'},400);
  try { return reply(await fetchReferenceRate(onDate)); }
  catch { return reply({error:'El tipo de cambio no está disponible. Intenta de nuevo.'},503); }
}

export async function POST(request) {
  let input;
  try { input = await request.json(); } catch { return reply({error:'Solicitud inválida.'},400); }
  if (!isLedgerDate(input?.date) || !isLedgerDate(input?.rateDate) || typeof input?.rate !== 'string') {
    return reply({error:'Confirma un tipo de cambio válido.'},400);
  }
  try {
    const quote = await fetchReferenceRate(input.date);
    if (quote.rate !== input.rate || quote.date !== input.rateDate) {
      return reply({error:'Cambió el tipo de cambio. Consulta la cotización y confirma de nuevo.'},409);
    }
    if (!getSupabaseConfig()) return reply(quote);
    const client = createServiceClient();
    if (!client) throw new Error('Exchange rate storage unavailable');
    const { error } = await client.from('payment_exchange_rates').upsert(
      { rate:quote.rate, rate_date:quote.date }, { onConflict:'rate_date,rate', ignoreDuplicates:true },
    );
    if (error) throw error;
    const result = await client.from('payment_exchange_rates').select('id')
      .eq('rate_date',quote.date).eq('rate',quote.rate).single();
    if (result.error) throw result.error;
    return reply({ ...quote,id:result.data.id });
  } catch {
    return reply({error:'No se pudo confirmar el tipo de cambio. Revisa la conexión y la migración de la base compartida.'},503);
  }
}

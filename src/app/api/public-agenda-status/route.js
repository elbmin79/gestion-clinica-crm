import {createClient} from '@/lib/supabase/server';
import {createServiceClient} from '@/lib/supabase/service-client';
import {agendaSecret} from '@/lib/public-agenda-security';
export async function GET(request){
  const client=await createClient();
  const {data:{user}={}}=client?await client.auth.getUser():{};
  if(!user)return Response.json({error:'Inicia sesión.'},{status:401});
  const clinicId=new URL(request.url).searchParams.get('clinicId');
  if(!/^[\da-f-]{36}$/i.test(clinicId||''))return Response.json({error:'Clínica inválida.'},{status:400});
  const {data,error}=await client.from('clinic_memberships').select('user_id').eq('clinic_id',clinicId).eq('user_id',user.id).maybeSingle();
  if(error||!data)return Response.json({error:'Acceso no permitido.'},{status:403});
  const secretConfigured=agendaSecret().length>=32;
  const databaseConfigured=Boolean(createServiceClient());
  return Response.json({configured:secretConfigured&&databaseConfigured,secretConfigured,databaseConfigured},{headers:{'Cache-Control':'no-store'}});
}

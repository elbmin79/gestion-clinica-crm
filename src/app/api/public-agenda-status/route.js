import {createClient} from '@/lib/supabase/server';
import {createServiceClient} from '@/lib/supabase/service-client';
import {agendaSecret} from '@/lib/public-agenda-security';
export async function GET(request){
  const client=await createClient();
  const {data:{user}={}}=client?await client.auth.getUser():{};
  if(!user)return Response.json({error:'Inicia sesión.'},{status:401});
  const clinicId=new URL(request.url).searchParams.get('clinicId');
  if(!/^[\da-f-]{36}$/i.test(clinicId||''))return Response.json({error:'Clínica inválida.'},{status:400});
  const {data,error}=await client.from('clinic_memberships').select('role').eq('clinic_id',clinicId).eq('user_id',user.id).maybeSingle();
  if(error||!data||!['admin','receptionist'].includes(data.role))return Response.json({error:'Acceso no permitido.'},{status:403});
  const captchaConfigured=Boolean(process.env.TURNSTILE_SITE_KEY&&process.env.TURNSTILE_SECRET_KEY);
  return Response.json({configured:agendaSecret().length>=32&&Boolean(createServiceClient())&&(process.env.NODE_ENV!=='production'||captchaConfigured),captchaConfigured,requiresCaptcha:process.env.NODE_ENV==='production'},{headers:{'Cache-Control':'no-store'}});
}

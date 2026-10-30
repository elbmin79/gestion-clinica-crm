import { authorizedPushDispatch } from '@/lib/push-dispatch';
import { runStaffPush } from '@/lib/push.server';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request) {
  if(!authorizedPushDispatch(request,process.env.CRON_SECRET))return Response.json({error:'Unauthorized'},{status:401});
  try{return Response.json({ok:true,counts:await runStaffPush(5)});}
  catch{return Response.json({error:'Push dispatch unavailable'},{status:503});}
}
export const POST=GET;

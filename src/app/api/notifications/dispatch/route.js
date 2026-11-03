import { authorizedPushDispatch } from '@/lib/push-dispatch';
import { pushStatus, runStaffPush } from '@/lib/push.server';
import { runStaffNativePush } from '@/lib/native-push.server.js';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request) {
  if(!authorizedPushDispatch(request,process.env.CRON_SECRET))return Response.json({error:'Unauthorized'},{status:401});
  try{
    const empty={sent:0,failed:0,pending:0,skipped:0};
    const web=pushStatus().configured?await runStaffPush(5):empty;
    const native=await runStaffNativePush(5);
    return Response.json({ok:true,counts:{sent:web.sent+native.sent,failed:web.failed+native.failed,pending:web.pending+native.pending,skipped:web.skipped+native.skipped,native}});
  }
  catch{return Response.json({error:'Push dispatch unavailable'},{status:503});}
}
export const POST=GET;

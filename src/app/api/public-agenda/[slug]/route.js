import {publicAgendaRequest} from '@/lib/public-agenda.server';
import {publicAgendaAllowedOrigin} from '@/lib/public-agenda-security';
export const runtime='nodejs';
function addCors(response,request){
 const origin=publicAgendaAllowedOrigin(request);if(!origin)return response;
 const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type');headers.append('Vary','Origin');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export async function GET(request,{params}){const {slug}=await params;return addCors(await publicAgendaRequest(request,slug),request);}
export async function POST(request,{params}){const {slug}=await params;return addCors(await publicAgendaRequest(request,slug),request);}
export async function OPTIONS(request){
 const origin=publicAgendaAllowedOrigin(request);if(!origin)return new Response(null,{status:403});
 return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
}

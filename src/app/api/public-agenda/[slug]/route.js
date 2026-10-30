import {publicAgendaRequest} from '@/lib/public-agenda.server';
export const runtime='nodejs';
export async function GET(request,{params}){const {slug}=await params;return publicAgendaRequest(request,slug);}
export async function POST(request,{params}){const {slug}=await params;return publicAgendaRequest(request,slug);}

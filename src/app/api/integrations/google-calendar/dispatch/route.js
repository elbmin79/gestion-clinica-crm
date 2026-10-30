import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getGoogleServiceClient, runGoogleCalendarSync } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(request) {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!expected) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const result = await runGoogleCalendarSync(getGoogleServiceClient(), { limit: 25 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Google Calendar dispatch failed.' }, { status: 503 });
  }
}

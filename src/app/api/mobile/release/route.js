import { getMobileReleases } from '@/lib/mobile-release';

export function GET() {
  const { android, ios } = getMobileReleases();
  return Response.json({ android: android?.build ?? null, ios: ios?.build ?? null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

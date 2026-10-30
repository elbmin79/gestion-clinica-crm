import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { getSupabaseConfig } from './lib/supabase/config';

export async function proxy(request) {
  const config = getSupabaseConfig();
  const pathname = request.nextUrl.pathname;
  const isLoginRoute = pathname === '/login';
  const isForgotPasswordRoute = pathname === '/forgot-password';
  const isAuthCallbackRoute = pathname === '/auth/callback';
  const isReminderDispatchRoute = pathname === '/api/reminders/dispatch';
  // Only these explicit public booking routes bypass staff login. The API itself
  // enforces publication, field validation, bot checks and throttling.
  if (/^\/reservar\/[a-z0-9][a-z0-9-]{2,59}$/.test(pathname) || /^\/api\/public-agenda\/[a-z0-9][a-z0-9-]{2,59}$/.test(pathname)) return NextResponse.next({request});
  // These routes perform their own authentication or serve public PWA metadata.
  const isPushRoute = pathname === '/api/notifications/dispatch' || pathname === '/api/notifications/push' || pathname === '/sw.js' || pathname === '/manifest.webmanifest';
  if (isPushRoute) return NextResponse.next({ request });

  if (!config) {
    // Local development stays usable without Supabase, but a production
    // deployment must never expose the editable, browser-local demo as CRM.
    // The dispatch route handles its own secret and returns 503 until fully
    // configured, so schedulers can receive a useful response.
    if (process.env.NODE_ENV !== 'production' || isLoginRoute || isReminderDispatchRoute) {
      return NextResponse.next({ request });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('error', 'not-configured');
    return NextResponse.redirect(loginUrl);
  }

  // This endpoint verifies REMINDER_DISPATCH_SECRET before using its
  // service-role client. User-cookie authentication would block cron callers.
  if (isReminderDispatchRoute || isAuthCallbackRoute) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // An unauthenticated request can return `data: null` from getClaims().
  // Keep that path on the login redirect instead of throwing in the proxy.
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if ((!claims || error) && !isLoginRoute && !isForgotPasswordRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
    for (const header of ['cache-control', 'expires', 'pragma']) {
      const value = response.headers.get(header);
      if (value) redirectResponse.headers.set(header, value);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

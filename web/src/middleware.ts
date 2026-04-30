import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const REALM = 'Husen Admin';

export function middleware(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  const user = process.env.ADMIN_USER ?? 'admin';

  if (!password) {
    return new NextResponse('ADMIN_PASSWORD is not configured.', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  const credentials = parseBasicAuth(request.headers.get('authorization'));
  if (credentials && credentials.user === user && credentials.password === password) {
    return NextResponse.next();
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const config = {
  matcher: ['/admin/:path*'],
};

function parseBasicAuth(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null;

  try {
    const decoded = atob(header.slice('Basic '.length));
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;
    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

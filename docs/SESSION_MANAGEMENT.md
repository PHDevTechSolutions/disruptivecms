# Session Management & User Persistence

This document describes the session cookie implementation for user authentication and persistence.

## Overview

The system implements secure, server-side session management using Firebase Admin SDK and HTTP-only cookies. Users stay logged in across browser restarts and page reloads, with automatic session expiry after 7 days or explicit logout.

## Architecture

### Key Components

1. **Session Module** (`lib/session.ts`)
   - Core session management utilities
   - Functions: `writeSessionCookie()`, `getSession()`, `validateSession()`, `clearSession()`, `refreshSession()`
   - Uses Firebase Admin SDK for server-side validation

2. **Auth API Routes**
   - `POST /api/auth/session` - Create session after login
   - `GET /api/auth/user` - Retrieve current session user (for persistence)
   - `POST /api/auth/logout` - Clear session
   - `POST /api/auth/refresh` - Refresh session expiry

3. **Auth Context/Hook** (`lib/useAuth.ts`)
   - Provides `AuthProvider` component wrapper
   - Exposes `useAuth()` hook for accessing user state
   - Exposes `useRequireAuth()` hook for protected routes
   - Handles automatic session checking on app load

4. **Protected Layout** (`components/layouts/protected-layout.tsx`)
   - Wrapper component for protected routes
   - Checks authentication before rendering
   - Shows loading state while verifying session

## User Flow

### Login Flow
```
1. User enters email/password
2. Firebase authenticates credentials (client-side)
3. Get Firebase ID token: await user.getIdToken()
4. POST /api/auth/session with ID token
5. Backend: Verify token → Fetch user data → Create custom session token
6. Set HTTP-only secure cookie with 7-day expiry
7. Return user data to client
8. Redirect to role-based dashboard
```

### Session Persistence Flow
```
1. User closes browser
2. User reopens site
3. AuthProvider checks session on mount via GET /api/auth/user
4. Backend verifies session cookie with Firebase
5. If valid: Return user data → App loads with user logged in
6. If invalid: Clear session → Redirect to login
```

### Logout Flow
```
1. User clicks logout button
2. Sign out from Firebase client
3. POST /api/auth/logout to clear server session
4. Clear localStorage
5. Clear client-side user state
6. Redirect to login page
```

## Security Features

- **HTTP-Only Cookies**: Prevents XSS attacks by making cookies inaccessible to JavaScript
- **Secure Flag**: Ensures cookies are only sent over HTTPS in production
- **SameSite=Strict**: Prevents CSRF attacks by restricting cross-site cookie sending
- **Server-Side Validation**: All sessions validated with Firebase Admin SDK
- **Automatic Expiry**: Sessions expire after 7 days or explicit logout
- **No Token Leakage**: Sensitive tokens never stored in localStorage

## Usage

### For Users

Users automatically stay logged in after successful authentication. Simply login once, and the session persists:

```
1. Login with email/password or Google
2. Get redirected to dashboard
3. Close browser, reopen site
4. You're still logged in!
5. Click "Sign out" to explicitly logout
```

### For Developers

#### Using the Auth Hook

```typescript
"use client";

import { useAuth } from "@/lib/useAuth";

export function MyComponent() {
  const { user, isLoading, isLoggedIn, logout } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!isLoggedIn) return <div>Not logged in</div>;

  return (
    <div>
      <p>Welcome, {user?.name}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

#### Protecting Routes

Wrap page components with `ProtectedLayout`:

```typescript
"use client";

import { ProtectedLayout } from "@/components/layouts/protected-layout";

export default function DashboardPage() {
  return (
    <ProtectedLayout>
      <div>Protected dashboard content</div>
    </ProtectedLayout>
  );
}
```

#### Requiring Authentication

Use `useRequireAuth()` in components to ensure user is logged in:

```typescript
"use client";

import { useRequireAuth } from "@/lib/useAuth";

export default function AdminPanel() {
  const { user, isLoading } = useRequireAuth();

  if (isLoading) return <div>Loading...</div>;

  return <div>Admin content for {user?.name}</div>;
}
```

## Session Configuration

### Session Duration
- **Default**: 7 days
- **Location**: `lib/session.ts` - `SESSION_MAX_AGE` constant
- To change, update: `const SESSION_MAX_AGE = 7 * 24 * 60 * 60;`

### Refresh Interval
- **Default**: 6 hours
- **Purpose**: Automatically refresh active sessions
- **Location**: `lib/useAuth.ts` - useEffect with interval
- To change, update: `6 * 60 * 60 * 1000` (milliseconds)

## API Endpoints

### POST /api/auth/session
Creates a session cookie after Firebase authentication.

**Request:**
```json
{
  "idToken": "firebase_id_token_string"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "uid": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin",
    "accessLevel": "full"
  }
}
```

**Response (Error):**
```json
{
  "error": "Failed to create session"
}
```

### GET /api/auth/user
Retrieves current logged-in user from session.

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "uid": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin",
    "accessLevel": "full"
  }
}
```

**Response (Not Logged In):**
```json
{
  "error": "Unauthorized"
}
```

### POST /api/auth/logout
Clears the session cookie and logs out the user.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### POST /api/auth/refresh
Refreshes the session cookie to extend expiry.

**Response (Success):**
```json
{
  "success": true,
  "user": { ... },
  "message": "Session refreshed"
}
```

**Response (Failed):**
```json
{
  "error": "Failed to refresh session"
}
```

## Environment Variables

The session system uses existing Firebase Admin SDK environment variables:

```
FIREBASE_ADMIN_TYPE
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_PRIVATE_KEY_ID
FIREBASE_ADMIN_PRIVATE_KEY
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_CLIENT_ID
FIREBASE_ADMIN_AUTH_URI
FIREBASE_ADMIN_TOKEN_URI
FIREBASE_ADMIN_AUTH_PROVIDER_CERT
FIREBASE_ADMIN_CLIENT_CERT
```

These must be configured in your Vercel project for the session system to work.

## Troubleshooting

### User Not Staying Logged In

1. Check that `AuthProvider` wraps the entire app in `app/layout.tsx`
2. Verify Firefox/Chrome allows cookies (check privacy settings)
3. Check browser DevTools → Application → Cookies for `admin_session_token`
4. Check browser console for errors in `/api/auth/user` call

### Session Not Clearing on Logout

1. Verify `/api/auth/logout` is being called (check Network tab)
2. Check that `clearSession()` in `lib/session.ts` executes without error
3. Clear browser cache and cookies manually

### Firebase Admin SDK Errors

1. Verify all `FIREBASE_ADMIN_*` env vars are set correctly
2. Check Firebase Admin credentials JSON format (especially `private_key` escaping)
3. Ensure service account has appropriate permissions in Firebase

### CORS or Network Errors

1. Ensure API routes are in `app/api/` directory
2. Verify routes are using `NextRequest` and `NextResponse`
3. Check CORS headers if calling from different domain

## Best Practices

1. **Always use HTTPS in production** - Required for Secure cookie flag
2. **Never log session cookies** - They contain authentication tokens
3. **Call logout explicitly** - Don't just close browser and expect cleanup
4. **Refresh sessions on important actions** - Call `POST /api/auth/refresh` after sensitive operations
5. **Monitor session usage** - Track login/logout events for security audit
6. **Rotate tokens periodically** - Consider implementing token rotation for enhanced security

## Future Enhancements

- Two-factor authentication (2FA) integration
- Device fingerprinting for anomaly detection
- Login history and active sessions management
- IP-based session validation
- Token rotation mechanism
- Session-level permissions checking

# Admin Account Registration - Secondary Firebase App Implementation

## Problem Solved
When a superadmin created a user account via `/admin/register`, the `createUserWithEmailAndPassword()` function automatically signed in the newly created user. This caused:
- Superadmin session to be replaced with the new user's session
- Superadmin to lose access to the admin dashboard
- User role to become "guest"
- Superadmin lockout from account provisioning workflow

## Solution: Secondary Firebase App Instance
Instead of using a server-side approach with Firebase Admin SDK, we use a **secondary Firebase app instance** that operates independently from the primary authenticated session.

### How It Works
1. **Primary App Instance** (`lib/firebase.ts`)
   - Authenticates the superadmin
   - Maintains the superadmin session throughout account creation
   - Unaffected by secondary app operations

2. **Secondary App Instance** (`lib/firebase-secondary.ts`)
   - Separate Firebase instance initialized with same config
   - Used ONLY for creating new user accounts
   - Immediately signed out after account creation
   - Does not affect primary session

### Technical Implementation

#### 1. Secondary Firebase App (`lib/firebase-secondary.ts`)
```typescript
import { initializeApp, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);
```

#### 2. Updated Register Form (`components/auth-forms/register-form.tsx`)

**Key Changes:**
- Imports `secondaryAuth` from `lib/firebase-secondary`
- In admin context, uses secondary auth for user creation:
  ```typescript
  const secondaryCred = await createUserWithEmailAndPassword(
    secondaryAuth,  // ← Uses secondary instance
    email,
    password
  );
  ```
- Saves user metadata to Firestore using primary app's database
- Signs out secondary auth after account creation:
  ```typescript
  await signOut(secondaryAuth);  // ← Only secondary instance
  ```
- Primary superadmin session remains completely untouched

#### 3. Removed API Endpoint
- Deleted `/app/api/auth/register-admin/route.ts` (no longer needed)
- All account creation logic is now client-side with secondary instance

## Auth Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Superadmin at /admin/register (logged in to PRIMARY app)   │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─────────────────────────────────────┐
             │                                     │
        PRIMARY AUTH                        SECONDARY AUTH
        (Superadmin)                    (Account Creation)
             │                                     │
             │                          1. Create user
             │                          2. Update profile
             │                          3. Save to Firestore
             │                          4. Sign out secondary
             │                                     │
             └─────────────────────────────────────┘
                          │
        ✓ Session intact  │  ✓ New user created
        ✓ Still admin     │  ✓ Role set correctly
        ✓ Dashboard access│  ✓ Signed out (guest state)
```

## User Experience
- Superadmin creates account via form
- Form submits to handler with secondary auth
- Success message shows
- **Superadmin remains logged in**
- Form resets for next account creation
- No redirect, no session switch, no logout

## Security Properties
- `/admin/register` restricted to superadmin via `roleAccess.ts`
- Users cannot self-register
- All accounts provisioned exclusively by superadmin
- Secondary instance is isolated and immediately signed out
- Primary session never touched during account creation

## Constraints Satisfied
✓ No Firebase Admin SDK  
✓ No server-side privileged operations  
✓ Client-side implementation only  
✓ Uses existing `/app/api/auth` patterns (none in this case)  
✓ Superadmin session preserved  
✓ New users created in "guest" state  

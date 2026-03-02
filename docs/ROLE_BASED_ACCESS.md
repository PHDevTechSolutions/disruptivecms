# Role-Based Access Control (RBAC)

This document describes the role-based access control system for the CMS application.

## Overview

The application implements role-based access control to restrict which pages and features users can access based on their assigned role. Users are restricted to their designated pages and are shown an "Access Denied" page if they attempt to access unauthorized routes.

## User Roles

### 1. Administrator (`admin`)
- **Description**: Full system access
- **Accessible Pages**:
  - Dashboard (`/dashboard`)
  - Products (`/products/all-products`)
  - Content (`/content/blogs`)
  - Jobs (`/jobs/careers`)
  - Settings (`/settings`)

### 2. Warehouse Staff (`warehouse`)
- **Description**: Warehouse and inventory management
- **Accessible Pages**:
  - Dashboard (`/dashboard`)
  - Products (`/products/all-products`)

### 3. Staff (`staff`)
- **Description**: General staff access
- **Accessible Pages**:
  - Dashboard (`/dashboard`)
  - Products (`/products/all-products`)

### 4. Inventory (`inventory`)
- **Description**: Inventory management
- **Accessible Pages**:
  - Dashboard (`/dashboard`)
  - Products (`/products/all-products`)

### 5. Human Resources (`hr`)
- **Description**: HR and career management
- **Accessible Pages**:
  - Dashboard (`/dashboard`)
  - Jobs (`/jobs/careers`)

### 6. SEO Specialist (`seo`)
- **Description**: Content and SEO management
- **Accessible Pages**:
  - Dashboard (`/dashboard`)
  - Content (`/content/blogs`)

### 7. Customer Support Representative (`csr`)
- **Description**: Customer support and product knowledge
- **Accessible Pages**:
  - Dashboard (`/dashboard`)
  - Products (`/products/all-products`)

### 8. E-commerce Specialist (`ecomm`)
- **Description**: E-commerce management
- **Accessible Pages**:
  - Dashboard (`/dashboard`)
  - Products (`/products/all-products`)

### 9. Product Development (`pd`) ⭐ NEW
- **Description**: Product development and management
- **Accessible Pages**:
  - Products (`/products/all-products`)

## How It Works

### 1. User Registration
Users select their role during registration/account creation:
```tsx
<SelectItem value="pd">Product Development</SelectItem>
```

### 2. Login & Session
After successful login, the user is routed to their primary accessible page based on their role. For Product Development users, this is `/products/all-products`.

### 3. Access Control
The `ProtectedLayout` component enforces access control on protected routes:
- Checks the user's role against the `roleAccessConfig`
- Allows access if the role has permission for the route
- Redirects to `/access-denied` if the user lacks permission

### 4. Access Denied Page
When users try to access a page they don't have permission for:
- They see a friendly "Access Denied" message
- The page shows what page they were trying to access
- A button takes them to their primary accessible page

## Implementation Details

### File Structure
- **`lib/roleAccess.ts`**: Core RBAC configuration and utilities
- **`lib/useAuth.ts`**: Authentication context and hooks
- **`components/layouts/protected-layout.tsx`**: Route protection component
- **`components/role-based-render.tsx`**: Conditional rendering by role
- **`app/access-denied/page.tsx`**: Access denied error page

### Core Functions

#### `canAccessRoute(role: string, path: string): boolean`
Checks if a user with the given role can access a specific path.

```typescript
import { canAccessRoute } from "@/lib/roleAccess";

if (canAccessRoute("pd", "/products/all-products")) {
  // User can access this route
}
```

#### `getPrimaryRouteForRole(role: string): string`
Gets the main landing page for a user's role.

```typescript
import { getPrimaryRouteForRole } from "@/lib/roleAccess";

const primaryPage = getPrimaryRouteForRole("pd"); // "/products/all-products"
```

#### `getAccessibleRoutes(role: string): string[]`
Gets all routes accessible to a user's role.

```typescript
import { getAccessibleRoutes } from "@/lib/roleAccess";

const routes = getAccessibleRoutes("pd"); // ["/products/all-products"]
```

### Using the useAuth Hook

```typescript
import { useAuth } from "@/lib/useAuth";

export function MyComponent() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  return <div>Welcome, {user?.name} ({user?.role})</div>;
}
```

### Protected Routes

All protected routes are wrapped with `ProtectedLayout`:

```tsx
import { ProtectedLayout } from "@/components/layouts/protected-layout";

export default function MyPage() {
  return (
    <ProtectedLayout>
      <YourContent />
    </ProtectedLayout>
  );
}
```

### Conditional Rendering by Role

Use `RoleBasedRender` to show/hide content based on user role:

```tsx
import { RoleBasedRender } from "@/components/role-based-render";

export function AdminFeature() {
  return (
    <RoleBasedRender 
      allowedRoles={["admin"]} 
      fallback={<p>Feature not available for your role</p>}
    >
      <div>Admin-only feature</div>
    </RoleBasedRender>
  );
}
```

## Adding a New Role

To add a new role to the system:

1. **Add the role to register form** (`components/auth-forms/register-form.tsx`):
```tsx
<SelectItem value="newrole">New Role Name</SelectItem>
```

2. **Add the role to login validation** (`components/auth-forms/login-form.tsx`):
```typescript
const validRoles = [
  "admin",
  // ... existing roles
  "newrole",
];

const roleRoutes: Record<string, string> = {
  // ... existing routes
  newrole: "/default/path/for/newrole",
};
```

3. **Add the role to RBAC config** (`lib/roleAccess.ts`):
```typescript
export const roleAccessConfig: RoleAccessConfig = {
  // ... existing roles
  newrole: ["/accessible/page1", "/accessible/page2"],
};
```

## Modifying Access Permissions

To change which routes a role can access:

1. Open `lib/roleAccess.ts`
2. Update the `roleAccessConfig` object:
```typescript
pd: [
  "/products/all-products",
  "/products/new-page", // Add new accessible route
],
```

## Security Considerations

1. **Server-Side Validation**: The session is validated on the server using Firebase Admin SDK
2. **Role Enforcement**: The `ProtectedLayout` component prevents unauthorized access
3. **Session Expiry**: Sessions expire after 7 days automatically
4. **HTTP-Only Cookies**: Session cookies are HTTP-only and cannot be accessed by JavaScript
5. **Explicit Logout**: Users only logout when they explicitly choose to

## Testing Role-Based Access

1. Create a test account with the "Product Development" role
2. Log in with that account
3. Try accessing pages other than `/products/all-products`
4. You should be redirected to the access denied page
5. The button should take you back to `/products/all-products`

## Troubleshooting

### User can access unauthorized pages
- Check that the page is wrapped with `ProtectedLayout`
- Verify the `roleAccessConfig` in `lib/roleAccess.ts` is correct
- Check browser console for errors

### Access denied page shows wrong redirect
- Verify `getPrimaryRouteForRole()` in `lib/roleAccess.ts` has the correct path for the role
- Check that the role name matches exactly (case-sensitive)

### Role not showing in registration
- Verify the role is added to the register form SELECT options
- Verify the role is added to `validRoles` array in login form
- Verify the role is in `roleAccessConfig`

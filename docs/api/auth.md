# Authentication API

All auth endpoints are prefixed with `/api/auth`.

## Register

Create a new user account.

```
POST /api/auth/register
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "displayName": "TraderJoe"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Valid email address |
| `password` | string | Yes | Minimum 6 characters |
| `displayName` | string | No | Defaults to email prefix |

**Response** `201 Created`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "displayName": "TraderJoe"
  }
}
```

**Errors:**

| Status | Description |
|--------|-------------|
| 400 | Invalid email or password too short |
| 409 | Email already registered |

---

## Login

Authenticate an existing user.

```
POST /api/auth/login
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response** `200 OK`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "displayName": "TraderJoe"
  }
}
```

**Errors:**

| Status | Description |
|--------|-------------|
| 401 | Invalid email or password |

---

## Get Current User

Returns the authenticated user's profile.

```
GET /api/auth/me
```

**Headers:** `Authorization: Bearer <token>`

**Response** `200 OK`:

```json
{
  "id": "clx...",
  "email": "user@example.com",
  "displayName": "TraderJoe",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

---

## Update Profile

Update the authenticated user's display name.

```
PATCH /api/auth/me
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "displayName": "NewName"
}
```

**Response** `200 OK`:

```json
{
  "id": "clx...",
  "email": "user@example.com",
  "displayName": "NewName"
}
```

!!! info "JWT Configuration"
    Tokens expire after **7 days** by default. The JWT secret is configured via the `JWT_SECRET` environment variable.

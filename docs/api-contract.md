# PlayMatch API Contract & Standards

All endpoints adhere strictly to the JSON Response Envelope and HTTP status conventions described below.

---

## 1. Response Envelope

### Success Response (`2xx`)
```json
{
  "success": true,
  "data": { ... },
  "message": "Human readable confirmation message"
}
```

### Error Response (`4xx`, `5xx`)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Descriptive message",
    "details": [
      {
        "field": "startsAt",
        "message": "Game must be scheduled at least 60 minutes in advance"
      }
    ]
  }
}
```

---

## 2. Standard Headers

- `Content-Type: application/json`
- `Authorization: Bearer <access_token>` (for authenticated endpoints)
- `x-client-type: web | mobile` (optional, defaults to `web`)
- `X-Request-Id: <uuid>` (auto-generated or forwarded for tracing)

---

## 3. OpenAPI 3.0 Specification

The authoritative OpenAPI 3.0 specification is exported at:
- `server/openapi.json`

Run synchronization verification:
```bash
npm run openapi:check
```

Export or update spec:
```bash
npm run openapi:export
```

---

## 4. Key Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body or query parameters failed Zod schema |
| `AUTH_UNAUTHORIZED` | 401 | Missing, malformed, or expired access token |
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid email or password |
| `FORBIDDEN_ACCESS` | 403 | User role lacks permission |
| `NOT_FOUND` | 404 | Requested entity not found |
| `SCHEDULE_CONFLICT_DETECTED` | 409 | Player already has an overlapping game |
| `COURT_UNAVAILABLE` | 409 | Venue court is already reserved for the requested slot |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled internal exception |

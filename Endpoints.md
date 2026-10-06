# API Endpoints

Base URL examples use `http://localhost:3000`. All JSON request bodies require `Content-Type: application/json`.

## Authentication

`/auth/v1` endpoints do not use the `/api/v1` prefix.

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| POST | `/auth/v1/sign_in` | Public | Sign in and create a session. |
| GET | `/auth/v1/refresh_token` | Expired bearer token and valid session headers | Replace an expired access token. |
| DELETE | `/auth/v1/sign_out` | Bearer token and session headers | Sign-out request. |
| DELETE | `/auth/v1/clear_sessions` | System administrator | Delete expired sessions. |

### Sign in

`POST /auth/v1/sign_in`

```json
{
  "email": "person@example.com",
  "password": "your-password"
}
```

Success returns `success`, `sessionId`, `userId`, `user_name`, `isSystem`, `access_token`, and `_expire_on`. Use the `access_token` and `sessionId` in subsequent authenticated requests.

### Refresh token

`GET /auth/v1/refresh_token`

Send `Authorization: Bearer <expired_access_token>` and `sessionId: <session_id>`. A successful response contains the new `access_token`. Refresh is rejected while the current token is still valid, and it cannot refresh an expired session.

### Sign out and clear sessions

Sign out takes the same two headers. It responds with `{ "message": "Signed out successfully" }` on success. The current implementation does not reliably revoke the supplied session; do not treat sign-out as a guarantee that the session has been invalidated.

`DELETE /auth/v1/clear_sessions` requires a valid system-administrator session and removes expired sessions. The response reports the number cleared, or that none needed clearing.

## Authentication Headers

All `/api/v1/users`, `/api/v1/lookups`, and `/api/v1/transactions` routes require:

```http
Authorization: Bearer <access_token>
sessionId: <session_id>
```

The `Authorization` value must use the `Bearer` scheme. Both values are returned by sign-in. Missing or invalid headers fail authentication.

## Users

Base path: `/api/v1/users`

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/users` | System administrator | List users with pagination and filters. |
| POST | `/api/v1/users` | System administrator | Create a user. |
| PATCH | `/api/v1/users/change_password` | Any authenticated user | Change the signed-in user's password. |
| GET | `/api/v1/users/:id` | System administrator | Fetch a user. |
| PATCH | `/api/v1/users/:id` | System administrator | Update a user's name and/or email. |
| DELETE | `/api/v1/users/:id` | System administrator | Deactivate a user. |
| PATCH | `/api/v1/users/:id/status` | Any authenticated user | Set a user's active status. |

List query parameters: `page` (default `1`), `size` (default `10`), `search` (matches name or email), `is_active` (`0` includes inactive users), `sortBy` (default `_created_on`), and `sortOrder` (`asc` or `desc`, default `asc`).

Create-user body:

```json
{
  "name": "Taylor Morgan",
  "email": "taylor@example.com",
  "password": "at-least-8-characters"
}
```

User names must start with a letter and contain 3-60 letters, digits, or spaces. Passwords must be 8-128 characters. A successful create returns `201` and `{ "_id": "<user_id>" }`.

Change-password body:

```json
{
  "old_password": "current-password",
  "new_password": "new-password-123"
}
```

Update-user body accepts one or both of `name` and `email`. Update-status body:

```json
{
  "is_active": false
}
```

User deletion is a soft delete. Deactivating a user also removes that user's sessions. The system administrator cannot be deleted or deactivated.

## Lookups

Base path: `/api/v1/lookups`. Lookups belong to the authenticated user.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/lookups` | List lookups. |
| POST | `/api/v1/lookups` | Create a lookup. |
| GET | `/api/v1/lookups/:id` | Fetch one lookup. |
| PATCH | `/api/v1/lookups/:id` | Update a lookup's name and/or parent. |
| DELETE | `/api/v1/lookups/:id` | Deactivate a lookup. |

List query parameters: `page` (default `1`), `size` (default `10`), `search` (name), `type[]` (one or more lookup types), `parent_id`, `is_active` (`0` includes inactive lookups), `sortBy` (default `_created_on`), and `sortOrder` (`asc` or `desc`, default `desc`). To pass multiple types, repeat the bracketed parameter, for example `?type[]=account&type[]=category`.

Supported `type` values: `account`, `type`, `category`, `sub_category`, and `payment_mode`. Category and sub-category lookups require a `parent_id`; categories must reference a type, and sub-categories must reference a category. A lookup of type `type` must be named `Expense` or `Income`.

Create body examples:

```json
{
  "type": "account",
  "name": "Checking"
}
```

```json
{
  "type": "category",
  "name": "Housing",
  "parent_id": "<type_lookup_id>"
}
```

Update body accepts `name` and/or `parent_id`. Deleting a type also deactivates its child categories and sub-categories; deleting a category also deactivates its sub-categories.

## Transactions

Base path: `/api/v1/transactions`. Transactions are private to the authenticated user.

| Method | Path | Description |
| --- | --- | --- |
| QUERY | `/api/v1/transactions` | List transactions. |
| POST | `/api/v1/transactions` | Create a transaction. |
| QUERY | `/api/v1/transactions/summary` | Aggregate transaction totals. |
| GET | `/api/v1/transactions/:id` | Fetch one transaction. |
| PUT | `/api/v1/transactions/:id` | Replace transaction fields. |
| DELETE | `/api/v1/transactions/:id` | Deactivate a transaction. |

### List transactions

`QUERY /api/v1/transactions` accepts a JSON request body with `page` (default `1`), `size` (default `10`), `is_active` (`0` includes inactive transactions), `search`, `sortBy` (default `date`), and `sortOrder` (`asc` or `desc`, default `desc`). `sortBy` may be `date`,  `account`, `type`, `payment_mode`, `amount`, `_created_on`, or `_updated_on`.

The body may also include lookup-ID filters: `type` as a single lookup ID, and `account`, `category`, and `payment_mode` as arrays of lookup IDs. All lookup IDs must be active lookups owned by the current user and match the corresponding lookup type.

Example:

```json
{
  "page": 1,
  "size": 10,
  "is_active": 1,
  "search": "rent",
  "sortBy": "date",
  "sortOrder": "desc",
  "type": "<type_lookup_id>",
  "account": ["<account_lookup_id>"],
  "category": ["<category_lookup_id>"],
  "payment_mode": ["<payment_mode_lookup_id>"]
}
```

The response contains `pagination` and `data`.

The current `search` implementation queries `descript` and `email` fields, rather than the stored transaction `description` field, so search may not find transactions as expected.

### Create or replace a transaction

Both `POST /api/v1/transactions` and `PUT /api/v1/transactions/:id` require the full transaction body. `date` must be a valid calendar date in `YYYY-MM-DD` format. `description` must start with a letter and contain up to 255 letters, digits, spaces, underscores, brackets, or hyphens. `amount` must be positive with at most two decimal places. `account` and `type` are required lookup IDs; `category`, `sub_category`, and `payment_mode` are optional IDs. If provided, `sub_category` requires `category`.

```json
{
  "date": "2026-09-29",
  "description": "Monthly rent",
  "amount": 1250.00,
  "account": "<account_lookup_id>",
  "type": "<type_lookup_id>",
  "category": "<category_lookup_id>",
  "sub_category": "<sub_category_lookup_id>",
  "payment_mode": "<payment_mode_lookup_id>"
}
```

The lookup IDs must be active lookups owned by the current user and match the corresponding lookup type. Create returns `201` with `{ "_id": "<transaction_id>" }`; update returns `200` with the transaction ID. Delete is a soft delete and returns `204` with no body.

Fetched transactions return joined lookup names for `account`, `type`, `category`, `sub_category`, and `payment_mode` rather than the lookup IDs.

### Transaction summary

The summary uses the HTTP `QUERY` method and a JSON body (not GET or POST):

`QUERY /api/v1/transactions/summary`

Allowed `group_by` values: `year`, `year_type`, `month`, `month_type`, `type`, `type_account`, `type_payment_mode`, `category`, `sub_category`, and `payment_mode`.

Example:

```json
{
  "group_by": "month_type",
  "year": 2026
}
```

The body may also include lookup-ID filters `account`, `type`, `category`, `sub_category`, and `payment_mode`, plus `start_date` and `end_date` in `YYYY-MM-DD` format. For `month`, `month_type`, `type`, `type_payment_mode`, `category`, `sub_category`, and `payment_mode`, `year` is required. For `type`, `type_payment_mode`, `category`, `sub_category`, and `payment_mode`, `month` is also required. `type` is required when grouping by `category` or `payment_mode`; `category` is required when grouping by `sub_category`.

The response is an array of grouped totals containing applicable `year` and `month` fields, lookup names, `total_amount`, and `count`.

## Health Check

`GET /v1/health_check` is public and returns HTTP `200` with no response body when the process is running. It is a process health check, not a MongoDB readiness check.

## Responses and Errors

Success response shapes vary by endpoint: list endpoints return `{ "pagination": { ... }, "data": [ ... ] }`, creates and updates commonly return an `_id`, and deletes return `204` with no body.

Errors generally return JSON containing a `message` or `error`; validation errors may also include an `error` detail. Common statuses include `400` for missing/invalid request headers, `401` for authentication failures, `404` for missing records, `409` for duplicate data, and `422` for invalid input. Some list endpoints return a generic `500` response if their database operation fails.

# Personal Tracker API

A Node.js and Express REST API for managing users, sessions, personal finance lookups, and transactions. Data is stored in MongoDB, passwords are hashed with Argon2i, and authenticated requests use a JWT plus a server-side session ID.

## Requirements

- Node.js 20 or later
- npm
- A MongoDB database (MongoDB Atlas or a reachable MongoDB instance)

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create or update the local `config.env` file in the project root. It is git-ignored; keep credentials and signing secrets out of source control.

   ```dotenv
   NODE_ENV=development
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password
   DB_NAME=expense_tracker_test
   JWT_SECRET=replace_with_a_long_random_secret
   ADMIN_PASSWORD=replace_with_a_strong_initial_admin_password
   DATABASE=mongodb+srv://<DB_USER>:<DB_PASSWORD>@<YOUR_CLUSTER_HOST>/?retryWrites=true&w=majority
   PORT=3000
   ```

   `DATABASE` must be a MongoDB connection URI. The application substitutes `<DB_USER>` and `<DB_PASSWORD>` with the values above.

3. Start the development server:

   ```sh
   npm run dev
   ```

   The API listens on `http://localhost:3000` unless `PORT` is changed. Development mode logs HTTP requests to the console.

The server creates its required MongoDB collections on startup. If the users collection is first created, it also creates a system administrator account with email `Administrator` and the initial password from `ADMIN_PASSWORD`. Set a strong password before the first startup and change it after signing in.

## Running in Production

On Windows, set `NODE_ENV=production` and run `npm run prod`. The current `prod` npm script uses Windows command syntax; the included Dockerfile uses this script as well, so its startup command needs adjustment for a Linux container environment.

## API Overview

- Authentication: `/auth/v1`
- Users: `/api/v1/users`
- Lookups: `/api/v1/lookups`
- Transactions: `/api/v1/transactions`
- Health check: `/v1/health_check`

See [Endpoints.md](Endpoints.md) for route methods, permissions, payloads, filters, and response examples.

Authenticated routes require both headers returned by sign-in:

```http
Authorization: Bearer <access_token>
sessionId: <session_id>
```

JSON request bodies require `Content-Type: application/json`. The server accepts JSON payloads up to 10 MB. The access token expires after 10 minutes; sessions last 60 minutes. Use the refresh-token endpoint after the access token expires but before the session expires.

## Notes

- The health-check endpoint returns HTTP 200 when the app responds; it does not verify MongoDB connectivity.
- User administration endpoints are restricted to the system administrator. Regular users can manage their own password, lookups, and transactions.
- `config.env` is excluded from Git. Never publish database credentials, the JWT secret, or the initial administrator password.

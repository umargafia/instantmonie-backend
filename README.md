# Payment Gateway Backend

A modern TypeScript-based authentication system with MongoDB and Express.

## Features

- User authentication (signup, login, logout)
- Password reset functionality
- JWT-based authentication
- Role-based access control
- Security features (rate limiting, XSS protection, etc.)
- TypeScript support
- MongoDB with Mongoose
- Express.js
- Zod for environment variable validation

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a .env file based on .env.example:
   ```bash
   cp .env.example .env
   ```
4. Update the environment variables in .env with your values

## Development

To start the development server:

```bash
npm run dev
```

This will start the server with hot-reload enabled.

## Production

To build and start the production server:

```bash
npm run build
npm start
```

## API Endpoints

### Authentication

- POST /api/v1/users/signup - Register a new user
- POST /api/v1/users/login - Login user
- GET /api/v1/users/logout - Logout user and terminate session
- POST /api/v1/users/forgotPassword - Request password reset
- PATCH /api/v1/users/resetPassword/:token - Reset password

### User Management

- GET /api/v1/users/me - Get current user
- PATCH /api/v1/users/updateMe - Update current user
- DELETE /api/v1/users/deleteMe - Delete current user
- PATCH /api/v1/users/updateMyPassword - Update password

### Session Management

- GET /api/v1/users/activeSessions - View your active session
- POST /api/v1/users/terminateSession - Terminate your current session

### Admin Routes

- GET /api/v1/users - Get all users
- GET /api/v1/users/:id - Get user by ID
- POST /api/v1/users - Create user
- PATCH /api/v1/users/:id - Update user
- DELETE /api/v1/users/:id - Delete user
- GET /api/v1/users/activeSessions - View all active sessions (can filter by userId)
- POST /api/v1/users/terminateSession/:userId - Terminate a specific user's session

## Security Features

- Rate limiting
- XSS protection
- NoSQL query injection protection
- Parameter pollution prevention
- CORS enabled
- Helmet for security headers
- JWT authentication
- Password hashing with bcrypt

## Error Handling

The application includes a global error handling system that handles:

- Validation errors
- JWT errors
- MongoDB errors
- Custom application errors

## TypeScript

The project is written in TypeScript and includes:

- Type definitions for all models
- Type-safe controllers and middleware
- Environment variable validation with Zod
- Custom type declarations for third-party modules

## Testing

To run tests:

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License.

# Payment Gateway Security Documentation

This document outlines the security features implemented in the Payment Gateway API.

## Authentication & Authorization

### JWT-Based Authentication

- Secure JWT tokens are issued during login and stored in HTTP-only cookies
- JWT expiration is configurable via environment variables
- Protection against sensitive data exposure by sanitizing user objects

### Single Session Management

- Users can only be logged in on one device at a time
- New logins automatically invalidate previous sessions
- Sessions can be manually terminated by users
- Admins can view and terminate any user's session
- Clear feedback when a session has been invalidated by a new login

### Account Security

- Brute force protection with account lockout after 5 failed login attempts
- Account remains locked for 30 minutes after too many failed attempts
- Secure password reset flow with time-limited tokens

### Role-Based Access Control

- Restricted routes based on user roles
- Admin-only endpoints for sensitive operations

## Security Headers & Protections

- Helmet middleware for setting security headers
- CORS protection with configurable origins
- Rate limiting to prevent abuse
- XSS protection
- Parameter pollution protection
- NoSQL injection protection

## Comprehensive Logging System

### Security Event Logging

- All authentication events (login, logout, password resets) are logged
- Failed login attempts tracked with IP address and user agent
- Account lockouts and suspicious activities are recorded
- JWT token creation and verification failures are monitored

### Log Management

- Security logs are stored in the database and can be queried
- Admin dashboard for viewing and filtering logs
- Retention policies for log management
- Sanitization of sensitive data in logs

## Suspicious Activity Detection

- IP-based rate limiting and detection
- Monitoring of failed login patterns
- API for reporting suspicious activities

## Data Protection

- All passwords are hashed using bcrypt
- Sensitive fields are excluded from responses
- Database sanitization for all inputs

## Environment Configuration

- Secure configuration management with zod schema validation
- Default secure values for development
- Clear separation between development and production environments

## Sample Security Configurations

### JWT Configuration

```
JWT_SECRET=your-secure-secret-key-here
JWT_EXPIRES_IN=90d
JWT_COOKIE_EXPIRES_IN=90
```

### Rate Limiting Configuration

The API is configured with the following rate limits:

- 100 requests per hour per IP address

## Security Best Practices for Clients

1. Always implement proper CSRF protection
2. Use HTTPS for all API calls
3. Don't store sensitive data in local storage
4. Implement proper token refresh mechanisms
5. Validate all input data on the client side as well

## Security Monitoring and Reporting

Security events can be monitored through the `/api/v1/logs` endpoint (admin only).
You can filter logs by:

- Type (security, application, user_activity, error)
- Severity (info, warn, error, debug)
- Action (LOGIN_SUCCESS, LOGIN_FAILURE, etc.)
- Date range
- User ID

## Future Security Enhancements

- Two-factor authentication
- IP allowlisting for admin operations
- Enhanced anomaly detection
- Security question recovery options

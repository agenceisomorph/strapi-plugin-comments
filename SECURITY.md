# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Active  |

## Reporting a Vulnerability

**Do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@isomorph.fr**

Include:
- Type of issue (XSS, injection, broken access control, etc.)
- Full path of the source file(s) related to the issue
- Step-by-step instructions to reproduce
- Impact of the issue

We will respond within **48 hours** and provide a fix within **7 days** for critical issues.

## Security Measures

This plugin implements:
- Input validation (Zod schemas on all endpoints)
- XSS sanitization (xss library)
- Profanity filtering (leo-profanity)
- Rate limiting (configurable per-route)
- reCAPTCHA V3 integration (optional)
- Admin-only access control (is-admin policy)
- No secrets in client-side code

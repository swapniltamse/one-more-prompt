# Threat model

What we're protecting: physical access to the car (unlock) and, to a lesser degree, its running state (remote start). Remote start alone doesn't let anyone drive away: the car still needs the key inside to shift out of park. Unlock is the command that matters.

## Why not clone the key fob?

Modern Toyota fobs use rolling codes and an encrypted challenge-response with the immobilizer. A phone can't speak that radio protocol, and recording-and-replaying fob signals is exactly how relay and RollJam-style car thefts work. This project only ever sends commands through the manufacturer's (or a simulated) cloud, the same path the official app uses.

## Threats and mitigations

| # | Threat | Mitigation | Where |
|---|---|---|---|
| 1 | Someone else signs up and controls the car | Cognito self-sign-up disabled. The API also checks the caller's `sub` against an owner allowlist, and an empty list denies everyone | `infra`, `auth/auth.ts` |
| 2 | Password phished or reused | TOTP MFA required for every user | `infra` (Cognito) |
| 3 | Phone stolen while signed in | Unlock requires a sign-in within the last 5 min (`auth_time`), so a stolen unlocked phone can lock but not unlock. Tokens expire in 1h, and no refresh tokens are kept on the device | `commands/commandService.ts`, `frontend/src/auth.ts` |
| 4 | Accidental unlock (pocket tap) | Press-and-hold to unlock | `CommandButton.tsx` |
| 5 | Network retry fires a command twice | Client-generated `Idempotency-Key` per tap, claimed atomically with a DynamoDB conditional transaction. A replay returns the original result | `commandService.ts`, `dynamoCommandStore.ts` |
| 6 | Captured request replayed later | Same idempotency key is a no-op. A new key needs a valid, unexpired token, and for unlock a fresh sign-in. All traffic is TLS-only | |
| 7 | Stolen token used to spam commands | API Gateway throttling (5 rps, burst 10) plus 6 commands/user/min in the service. Blocked attempts are logged and alarmed | `infra`, `commandService.ts` |
| 8 | XSS steals the token | Strict CSP (`script-src 'self'`, no inline scripts), React escaping, tokens in `sessionStorage` (not cookies), `frame-ancestors 'none'` | `infra` (CloudFront headers policy) |
| 9 | Forged or misused JWT | Verified twice: API Gateway JWT authorizer, then the Lambda checks signature, issuer, `token_use=access` and `client_id` | `auth/auth.ts` |
| 10 | Vendor credentials leak | Designed to load from Secrets Manager at runtime, never from env vars or the repo. Lambda role is scoped to one table | `toyotaProvider.ts` contract, `infra` |
| 11 | "Did someone open my car?" | Every command, including blocked ones, is stored with user, IP, user agent and outcome for 90 days. Alarms fire on failures and suspicious activity | `dynamoCommandStore.ts`, `infra` |

## Known gaps

- Rate limiting counts then claims, so two perfectly simultaneous requests can both pass the check. That's acceptable at this scale; a conditional counter item would close it.
- Step-up re-uses the full Cognito login. Passkeys would be a smoother second factor.
- Using an unofficial vendor API (if you implement the Toyota adapter) means your account credentials sit with this app. Treat it accordingly.

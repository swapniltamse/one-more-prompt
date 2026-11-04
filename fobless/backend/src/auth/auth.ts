import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../domain.js";

export interface Principal {
  userId: string;
  /** Epoch seconds when the user last actually authenticated (not when the token was refreshed). */
  authTime: number;
}

export interface TokenVerifier {
  verify(token: string): Promise<Principal>;
}

function principalFrom(payload: JWTPayload): Principal {
  const authTime = typeof payload.auth_time === "number" ? payload.auth_time : payload.iat;
  if (!payload.sub || typeof authTime !== "number") throw new AppError(401, "invalid_token", "Token missing claims");
  return { userId: payload.sub, authTime };
}

/** Verifies Cognito *access* tokens against the user pool's JWKS. */
export class CognitoVerifier implements TokenVerifier {
  private readonly jwks;
  private readonly issuer: string;

  constructor(region: string, userPoolId: string, private readonly clientId: string) {
    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer, algorithms: ["RS256"] });
    if (payload.token_use !== "access" || payload.client_id !== this.clientId) {
      throw new AppError(401, "invalid_token", "Wrong token type or audience");
    }
    return principalFrom(payload);
  }
}

/** Local-development tokens: HS256, issued by POST /api/auth/dev-login. Never enabled in AWS. */
export class DevTokenAuthority implements TokenVerifier {
  private readonly key: Uint8Array;
  private static readonly ISSUER = "fobless-dev";

  constructor(secret: string, private readonly pin: string) {
    if (secret.length < 32) throw new Error("DEV_JWT_SECRET must be at least 32 characters");
    this.key = new TextEncoder().encode(secret);
  }

  checkPin(candidate: string): boolean {
    const a = Buffer.from(candidate);
    const b = Buffer.from(this.pin);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async issue(userId: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
    return new SignJWT({ auth_time: nowSec })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(DevTokenAuthority.ISSUER)
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + 3600)
      .sign(this.key);
  }

  async verify(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, this.key, { issuer: DevTokenAuthority.ISSUER, algorithms: ["HS256"] });
    return principalFrom(payload);
  }
}

declare module "express-serve-static-core" {
  interface Request {
    principal?: Principal;
  }
}

/**
 * Bearer-token middleware. `allowedUsers` is the owner allowlist: this is a personal app,
 * so a valid login alone is not enough to unlock somebody's car.
 */
export function requireAuth(verifier: TokenVerifier, allowedUsers: ReadonlySet<string>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.get("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) return next(new AppError(401, "unauthenticated", "Missing bearer token"));
    let principal: Principal;
    try {
      principal = await verifier.verify(token);
    } catch (err) {
      return next(err instanceof AppError ? err : new AppError(401, "invalid_token", "Invalid or expired token"));
    }
    if (allowedUsers.size > 0 && !allowedUsers.has(principal.userId)) {
      return next(new AppError(403, "forbidden", "This account is not authorised for any vehicle"));
    }
    req.principal = principal;
    next();
  };
}

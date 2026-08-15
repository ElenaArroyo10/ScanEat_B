import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from "jose";
import { createSecretKey } from "crypto";
import env from "../../env";

export interface CustomJWTPayload extends JoseJWTPayload {
  user_id: number;
  email: string;
  role_id: number;
}

export const generateToken = async (payload: CustomJWTPayload) => {
  const secretKey = createSecretKey(env.JWT_SECRET, "utf-8");

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secretKey);
};

export const verifyToken = async (token: string) => {
  const secretKey = createSecretKey(env.JWT_SECRET, "utf-8");

  const { payload } = await jwtVerify(token, secretKey);

  return payload as CustomJWTPayload;
};
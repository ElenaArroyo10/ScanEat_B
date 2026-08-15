import { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/connection";
import { roleCodes, users } from "../db/schemas/userSchema";

import { generateToken } from "../utils/jwt";
import { hashPassword } from "../utils/passwords";

export const register = async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, password, code, role_id } = req.body;

    if (!first_name || !last_name || !email || !password || !code || !role_id) {
      return res.status(400).json({ message: "Faltan campos requeridos" });
    }

    const validRoleCode = await db
      .select()
      .from(roleCodes)
      .where(
        and(
          eq(roleCodes.code, code),
          eq(roleCodes.role_id, role_id),
          eq(roleCodes.is_active, true)
        )
      )
      .limit(1);

    if (!validRoleCode.length) {
      return res.status(400).json({
        message: "Código invalido",
      });
    }

    const hashedPassword = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({
        first_name,
        last_name,
        email,
        password: hashedPassword,
        role_id: validRoleCode[0].role_id,
      })
      .returning({
        user_id: users.user_id,
        email: users.email,
        role_id: users.role_id,
      });

    const token = await generateToken({
      user_id: user.user_id,
      email: user.email,
      role_id: user.role_id,
    });

    return res
      .status(201)
      .json({ message: "Usuario registrado correctamente", token });
  } catch (error) {
    console.error("Error during registration:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
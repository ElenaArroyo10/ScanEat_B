import { Router } from "express";
import {
  forgotPassword,
  register,
  resendVerificationCode,
  resetPassword,
  verifyEmail,
  login,
  verifyLoginCode,} from "../controllers/authController";
import { validateBody } from "../middleware/validations";
import { registerUserSchema } from "../db/schemas/userSchema";

const router = Router();

router.post("/register", validateBody(registerUserSchema), register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification-code", resendVerificationCode);
router.post("/login", login);
router.post("/verify-login-code", verifyLoginCode);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
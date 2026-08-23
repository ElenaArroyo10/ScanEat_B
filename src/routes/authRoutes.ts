import { Router } from "express";
import {
  forgotPassword,
  register,
  resendVerificationCode,
  resetPassword,
  verifyEmail,
  login,
  verifyLoginCode,
  resendLoginCode,
  resendResetCode,
  editProfile,
changePassword} from "../controllers/authController";
import { validateBody } from "../middleware/validations";
import { registerUserSchema } from "../db/schemas/userSchema";
import { authenticate } from "../middleware/authenticate";
import { strictLimiter,moderateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.post("/register",moderateLimiter, validateBody(registerUserSchema), register);
router.post("/verify-email",strictLimiter, verifyEmail);
router.post("/resend-verification-code",moderateLimiter, resendVerificationCode);
router.post("/login",strictLimiter, login);
router.post("/verify-login-code",strictLimiter, verifyLoginCode);
router.post("/resend-login-code",moderateLimiter, resendLoginCode);
router.post("/forgot-password",moderateLimiter, forgotPassword);
router.post("/reset-password",strictLimiter, resetPassword);
router.post("/resend-reset-code",moderateLimiter, resendResetCode);
router.patch("/edit-profile", authenticate, editProfile);
router.patch("/change-password", authenticate, changePassword);
export default router;
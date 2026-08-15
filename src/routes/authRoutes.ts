import { register } from "../controllers/authController";
import { validateBody } from "../middleware/validations";
import { registerUserSchema } from "../db/schemas/userSchema";
import { Router } from "express";

const router = Router();

router.post("/register", validateBody(registerUserSchema), register);

export default router;
import { Request, Response, NextFunction } from 'express';

import { z } from 'zod';

export const validateBody = (schema: z.ZodTypeAny) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const validatedData = schema.parse(req.body);
            req.body = validatedData;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {

                const formattedErrors: Record<string, string> = {};

                error.issues.forEach((issue) => {
                    const field = issue.path[0];

                    if (typeof field === "string") {
                        formattedErrors[field] = issue.message;
                    }
                });

                return res.status(400).json({
                    message: "Validation failed",
                    errors: formattedErrors
                });
            }
        }
    }
}

export const validateParams = (schema: z.ZodTypeAny) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            schema.parse(req.params);
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    message: 'Invalid parameters',
                    errors: error.issues
                });
            }
            next(error);
        }
    }
}

export const validateQuery = (schema: z.ZodTypeAny) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            schema.parse(req.query);
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    message: 'Invalid query parameters',
                    errors: error.issues
                });
            }
            next(error);
        }
    }
}
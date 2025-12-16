import { Request, Response } from 'express';
import { registerSchema, loginSchema } from './auth.dto';
import { AuthReducer } from "./auth.reducer";
import { Result } from '../core/result';

export class AuthIntent {
    static async register(req: Request, res: Response) {
        const validation = registerSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json(Result.fail(validation.error));
        }

        const result = await AuthReducer.register(validation.data);

        if (result.success) {
            return res.status(201).json(result);
        } else {
            return res.status(400).json(result);
        }
    }

    static async login(req: Request, res: Response) {
        const validation = loginSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json(Result.fail(validation.error));
        }

        const result = await AuthReducer.login(validation.data);

        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(401).json(result);
        }
    }
}

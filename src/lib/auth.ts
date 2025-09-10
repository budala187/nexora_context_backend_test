import { Request, Response } from 'express';
import { config } from '../config/config';

export const oauthProtectedResourceHandler = (req: Request, res: Response) => {
    const metadata = JSON.parse(config.protectedResourceMetadata);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(metadata);
};
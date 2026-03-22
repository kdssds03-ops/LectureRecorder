import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Simple shared-secret middleware.
 * Mobile app must send:  x-app-key: <APP_SECRET>
 *
 * This is intentionally lightweight for MVP / TestFlight.
 * Replace with JWT auth when you add user accounts.
 */
export function requireAppKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-app-key'];

  if (!key || key !== config.appSecret) {
    res.status(401).json({ error: 'Unauthorized: missing or invalid x-app-key header.' });
    return;
  }

  next();
}

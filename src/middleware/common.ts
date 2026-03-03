import express from 'express';
import cookieParser from 'cookie-parser';

const DEFAULT_JSON_BODY_LIMIT = '15mb';

export function applyCommonMiddleware(app: express.Express) {
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || DEFAULT_JSON_BODY_LIMIT;
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(cookieParser());
}

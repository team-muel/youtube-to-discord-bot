import { Router, Response, type RequestHandler } from 'express';
import type { BackendFeatureKey } from '../backend/registry/externalFeatureRegistry';
import type { AuthenticatedRequest } from '../types';

type CrawlerRegistryLike = {
  getSources: (req: AuthenticatedRequest, res: Response) => Promise<Response | void>;
  addSource: (req: AuthenticatedRequest, res: Response) => Promise<Response | void>;
  deleteSource: (req: AuthenticatedRequest, res: Response) => Promise<Response | void>;
  updateSource: (req: AuthenticatedRequest, res: Response) => Promise<Response | void>;
  triggerTest: (req: AuthenticatedRequest, res: Response) => Promise<Response | void>;
};

type CrawlerRoutesDeps = {
  requireAuth: RequestHandler;
  requireAuthAndCsrf: RequestHandler;
  isBackendFeatureEnabled: (feature: BackendFeatureKey) => boolean;
  crawlerRegistry: CrawlerRegistryLike;
};

export const createCrawlerRouter = ({ requireAuth, requireAuthAndCsrf, isBackendFeatureEnabled, crawlerRegistry }: CrawlerRoutesDeps) => {
  const router = Router();

  router.get('/api/sources', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isBackendFeatureEnabled('sources')) {
      return res.status(410).json({ error: 'sources_feature_disabled' });
    }
    return crawlerRegistry.getSources(req, res);
  });

  router.post('/api/sources', requireAuthAndCsrf, async (req: AuthenticatedRequest, res: Response) => {
    if (!isBackendFeatureEnabled('sources')) {
      return res.status(410).json({ error: 'sources_feature_disabled' });
    }
    return crawlerRegistry.addSource(req, res);
  });

  router.delete('/api/sources/:id', requireAuthAndCsrf, async (req: AuthenticatedRequest, res: Response) => {
    if (!isBackendFeatureEnabled('sources')) {
      return res.status(410).json({ error: 'sources_feature_disabled' });
    }
    return crawlerRegistry.deleteSource(req, res);
  });

  router.put('/api/sources/:id', requireAuthAndCsrf, async (req: AuthenticatedRequest, res: Response) => {
    if (!isBackendFeatureEnabled('sources')) {
      return res.status(410).json({ error: 'sources_feature_disabled' });
    }
    return crawlerRegistry.updateSource(req, res);
  });

  router.post('/api/test-trigger', requireAuthAndCsrf, async (req: AuthenticatedRequest, res: Response) => {
    if (!isBackendFeatureEnabled('youtubeCrawler')) {
      return res.status(410).json({ error: 'youtube_crawler_feature_disabled' });
    }
    return crawlerRegistry.triggerTest(req, res);
  });

  return router;
};

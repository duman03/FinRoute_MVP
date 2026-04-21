import { missionEventQueue } from '../config/bullmq';

const SYMBOL_SECTOR_MAP: Record<string, string> = {
  AAPL: 'technology',
  ADBE: 'technology',
  AMD: 'technology',
  AMZN: 'technology',
  CRM: 'technology',
  GOOGL: 'technology',
  INTC: 'technology',
  META: 'technology',
  MSFT: 'technology',
  NFLX: 'technology',
  NVDA: 'technology',
  ORCL: 'technology',
  TSLA: 'technology',
};

export interface TradeCreatedMissionEvent {
  userId: string;
  tradeId: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  sector: string | null;
  eventTime: string;
}

export interface ArticleReadMissionEvent {
  userId: string;
  articleId: string;
  articleTag: string;
  eventTime: string;
}

export function getSymbolSector(symbol: string): string | null {
  return SYMBOL_SECTOR_MAP[ symbol.toUpperCase() ] || null;
}

export async function enqueueTradeCreatedMissionEvent(input: {
  userId: string;
  tradeId: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  eventTime: string;
}): Promise<void> {
  const payload: TradeCreatedMissionEvent = {
    userId: input.userId,
    tradeId: input.tradeId,
    symbol: input.symbol.toUpperCase(),
    action: input.action,
    sector: getSymbolSector(input.symbol),
    eventTime: input.eventTime,
  };

  await missionEventQueue.add('trade_created', payload, {
    jobId: `trade-${input.tradeId}`,
  });
}

export async function enqueueArticleReadMissionEvent(input: ArticleReadMissionEvent): Promise<void> {
  await missionEventQueue.add('article_read', input, {
    jobId: `article-read-${input.userId}-${input.articleId}`,
  });
}

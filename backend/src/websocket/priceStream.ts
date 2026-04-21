import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { env } from '../config/env';
import { TOKEN_CONFIG } from '../config/token';
import { logger } from '../utils/logger';

// Create a dedicated Redis connection for subscribing
const subscriber = new Redis(env.REDIS_URL);

interface SubscribeMessage {
  action: 'subscribe' | 'unsubscribe';
  symbol: string;
}

export const setupWebSocketServer = (server: http.Server): WebSocketServer => {
  const wss = new WebSocketServer({ noServer: true });

  // Track active clients for ping/pong healthcheck
  const aliveClients = new WeakSet<WebSocket>();

  // Map to track subscriptions: Symbol -> Set of WebSockets
  const subscriptions = new Map<string, Set<WebSocket>>();

  // Handle Redis PubSub messages
  subscriber.on('message', (channel, message) => {
    // Channel format: ws:price:<symbol>
    // Golden Rule #1: split(' ')[ 1 ]
    const parts = channel.split(':');
    const symbol = parts[2];
    if (!symbol) return;

    const clients = subscriptions.get(symbol);
    if (!clients || clients.size === 0) return;

    try {
      const payload = JSON.parse(message);

      const outgoingMessage = JSON.stringify({
        type: 'price_update',
        symbol: payload.symbol,
        price: payload.price,
        ts: payload.ts,
        source: payload.source,
        stream_id: `${payload.ts}-0` // Format matches N-01 replay logic XADD timestamp IDs
      });

      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(outgoingMessage);
        }
      }
    } catch (err) {
      logger.error('Error processing redis message:', err);
    }
  });

  // Handle upgrade for exact path and JWT validation
  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws/prices') {
        // Not our path, destroy connection
        return;
      }

      const token = url.searchParams.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Verify JWT
      jwt.verify(token, env.JWT_SECRET, { maxAge: TOKEN_CONFIG.accessTTL }, (err, decoded) => {
        if (err) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Token valid, handle WebSocket upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, decoded);
        });
      });
    } catch (err) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    }
  });

  // Client connection handler
  wss.on('connection', (ws) => {
    logger.info('New WebSocket client connected to /ws/prices');

    aliveClients.add(ws);
    ws.on('pong', () => aliveClients.add(ws));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as SubscribeMessage;

        if (msg.action === 'subscribe' && msg.symbol) {
          const symbol = msg.symbol.toUpperCase();
          if (!subscriptions.has(symbol)) {
            subscriptions.set(symbol, new Set());
            // Start listening to this channel on Redis
            subscriber.subscribe(`ws:price:${symbol}`);
          }
          subscriptions.get(symbol)?.add(ws);
          logger.info(`WS client subscribed to ${symbol}`);
        }
        else if (msg.action === 'unsubscribe' && msg.symbol) {
          const symbol = msg.symbol.toUpperCase();
          const clients = subscriptions.get(symbol);
          if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
              subscriptions.delete(symbol);
              subscriber.unsubscribe(`ws:price:${symbol}`);
            }
          }
          logger.info(`WS client unsubscribed from ${symbol}`);
        }
      } catch (err: any) {
        logger.error(`Error parsing WS message: ${err.message}`);
      }
    });

    ws.on('close', () => {
      // Remove connection from all active subscriptions
      for (const [symbol, clients] of subscriptions.entries()) {
        clients.delete(ws);
        if (clients.size === 0) {
          subscriptions.delete(symbol);
          subscriber.unsubscribe(`ws:price:${symbol}`);
        }
      }
    });
  });

  // Health check ping every 30 seconds
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!aliveClients.has(ws)) {
        return ws.terminate();
      }
      aliveClients.delete(ws);
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
    subscriber.disconnect();
  });

  return wss;
};

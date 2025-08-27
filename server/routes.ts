import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertWhatsappSessionSchema } from "@shared/schema";
import { WhatsAppService } from "./services/whatsapp";
import { randomUUID } from "crypto";

const whatsappService = new WhatsAppService();
const activeConnections = new Map<string, WebSocket[]>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // WebSocket server setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      ws.close(1008, 'Session ID required');
      return;
    }
    
    // Add connection to session tracking
    if (!activeConnections.has(sessionId)) {
      activeConnections.set(sessionId, []);
    }
    activeConnections.get(sessionId)!.push(ws);
    
    ws.on('close', () => {
      const connections = activeConnections.get(sessionId);
      if (connections) {
        const index = connections.indexOf(ws);
        if (index > -1) {
          connections.splice(index, 1);
        }
        if (connections.length === 0) {
          activeConnections.delete(sessionId);
          // Cleanup abandoned session after 5 minutes
          setTimeout(() => {
            whatsappService.cleanupSession(sessionId);
          }, 5 * 60 * 1000);
        }
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Broadcast message to all connections for a session
  function broadcastToSession(sessionId: string, message: any) {
    const connections = activeConnections.get(sessionId);
    if (connections) {
      const messageStr = JSON.stringify(message);
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        }
      });
    }
  }

  // Generate session ID
  app.post("/api/sessions/generate-id", async (req, res) => {
    try {
      const id = 'wa-session-' + randomUUID().slice(0, 8);
      res.json({ id });
    } catch (error) {
      console.error('Error generating ID:', error);
      res.status(500).json({ message: "Failed to generate ID" });
    }
  });

  // Create new session
  app.post("/api/sessions", async (req, res) => {
    try {
      const validatedData = insertWhatsappSessionSchema.parse(req.body);
      
      // Check if session ID already exists
      const existingSession = await storage.getSession(validatedData.id);
      if (existingSession) {
        return res.status(409).json({ message: "Session ID already exists" });
      }
      
      const session = await storage.createSession(validatedData);
      res.json(session);
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  // Get session
  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error('Error fetching session:', error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Start QR pairing
  app.post("/api/sessions/:id/qr-pairing", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = await storage.getSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      await storage.updateSession(sessionId, { 
        pairingMethod: "qr",
        status: "pending" 
      });

      // Start QR pairing process
      const result = await whatsappService.startQRPairing(sessionId, (data) => {
        broadcastToSession(sessionId, data);
      });

      res.json(result);
    } catch (error) {
      console.error('Error starting QR pairing:', error);
      res.status(500).json({ message: "Failed to start QR pairing" });
    }
  });

  // Request pairing code
  app.post("/api/sessions/:id/request-code", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const { phoneNumber } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      await storage.updateSession(sessionId, { 
        pairingMethod: "code",
        phoneNumber,
        status: "pending" 
      });

      const result = await whatsappService.requestPairingCode(sessionId, phoneNumber, (data) => {
        broadcastToSession(sessionId, data);
      });

      res.json(result);
    } catch (error) {
      console.error('Error requesting pairing code:', error);
      res.status(500).json({ message: "Failed to request pairing code" });
    }
  });

  // Submit pairing code
  app.post("/api/sessions/:id/submit-code", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({ message: "Pairing code is required" });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const result = await whatsappService.submitPairingCode(sessionId, code, (data) => {
        broadcastToSession(sessionId, data);
      });

      res.json(result);
    } catch (error) {
      console.error('Error submitting pairing code:', error);
      res.status(500).json({ message: "Failed to submit pairing code" });
    }
  });

  // Refresh QR code
  app.post("/api/sessions/:id/refresh-qr", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = await storage.getSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const result = await whatsappService.refreshQR(sessionId, (data) => {
        broadcastToSession(sessionId, data);
      });

      res.json(result);
    } catch (error) {
      console.error('Error refreshing QR code:', error);
      res.status(500).json({ message: "Failed to refresh QR code" });
    }
  });

  // Setup WhatsApp service event handlers
  whatsappService.on('session_connected', async (sessionId: string, sessionData: any) => {
    await storage.updateSession(sessionId, {
      status: "connected",
      sessionData,
      connectedAt: new Date(),
    });
    
    broadcastToSession(sessionId, {
      type: 'session_connected',
      sessionId,
      timestamp: new Date().toISOString(),
    });
  });

  whatsappService.on('session_failed', async (sessionId: string, error: string) => {
    await storage.updateSession(sessionId, {
      status: "failed",
    });
    
    broadcastToSession(sessionId, {
      type: 'session_failed',
      sessionId,
      error,
      timestamp: new Date().toISOString(),
    });
  });

  return httpServer;
}

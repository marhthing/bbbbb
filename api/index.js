import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from '../lib/storage.js';
import { insertWhatsappSessionSchema } from '../shared/schema.js';
import { WhatsAppService } from '../lib/whatsapp.js';
import { randomUUID } from 'crypto';

const app = express();
const whatsappService = new WhatsAppService();
const activeConnections = new Map();

// Performance optimizations for serverless
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Generate session ID
app.post("/api/sessions/generate-id", async (req, res) => {
  try {
    const id = 'MATDEV-' + randomUUID().slice(0, 8);
    res.json({ id });
  } catch (error) {
    console.error('Error generating ID:', error);
    res.status(500).json({ message: "Failed to generate ID" });
  }
});

// Check session status
app.get("/api/sessions/check/:id", async (req, res) => {
  try {
    const session = await storage.getSession(req.params.id);
    if (!session) {
      return res.json({ exists: false });
    }
    res.json({ 
      exists: true, 
      status: session.status,
      isActive: session.status === "connected",
      pairingMethod: session.pairingMethod,
      createdAt: session.createdAt
    });
  } catch (error) {
    console.error('Error checking session:', error);
    res.status(500).json({ message: "Failed to check session" });
  }
});

// Create new session
app.post("/api/sessions", async (req, res) => {
  try {
    const validatedData = insertWhatsappSessionSchema.parse(req.body);
    
    // Check if session ID already exists
    const existingSession = await storage.getSession(validatedData.id);
    if (existingSession) {
      // If session exists and is connected, don't allow reuse
      if (existingSession.status === "connected") {
        return res.status(409).json({ message: "Session ID is already active and connected" });
      }
      // If session exists but is pending/failed/disconnected, allow reuse
      const updatedSession = await storage.updateSession(validatedData.id, {
        pairingMethod: validatedData.pairingMethod,
        status: "pending",
        updatedAt: new Date()
      });
      return res.json(updatedSession);
    }
    
    const session = await storage.createSession(validatedData);
    res.json(session);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ message: "Failed to create session" });
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

    // Check if there's already a session with this phone number and delete it
    const existingSessionWithPhone = await storage.getSessionByPhoneNumber(phoneNumber);
    if (existingSessionWithPhone && existingSessionWithPhone.id !== sessionId) {
      console.log(`Deleting existing session for phone number ${phoneNumber}: ${existingSessionWithPhone.id}`);
      await storage.deleteSession(existingSessionWithPhone.id);
    }

    // Update session with phone number
    await storage.updateSession(sessionId, { 
      pairingMethod: "code",
      phoneNumber,
      status: "pending",
      updatedAt: new Date()
    });

    // Generate pairing code
    const result = await whatsappService.requestPairingCode(sessionId, phoneNumber);
    res.json(result);
  } catch (error) {
    console.error('Error requesting pairing code:', error);
    res.status(500).json({ message: "Failed to request pairing code" });
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

    // Update pairing method
    await storage.updateSession(sessionId, { 
      pairingMethod: "qr",
      status: "pending",
      phoneNumber: null,
      updatedAt: new Date()
    });

    const result = await whatsappService.startQRPairing(sessionId);
    res.json(result);
  } catch (error) {
    console.error('Error starting QR pairing:', error);
    res.status(500).json({ message: "Failed to start QR pairing" });
  }
});

// Export for Vercel
export default app;
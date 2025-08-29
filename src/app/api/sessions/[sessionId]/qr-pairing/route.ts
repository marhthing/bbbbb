import { NextRequest, NextResponse } from 'next/server'
import { whatsappService } from '../../../../../lib/whatsapp-service'
import { storage } from '../../../../../lib/storage'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }
    
    // Check if session exists, if not create it
    let session = await storage.getSession(sessionId)
    if (!session) {
      session = await storage.createSession({
        id: sessionId,
        status: 'pending',
        pairingMethod: 'qr'
      })
    } else {
      // Update existing session
      session = await storage.updateSession(sessionId, {
        status: 'pending',
        pairingMethod: 'qr'
      })
    }
    
    // Start QR pairing
    const result = await whatsappService.startQRPairing(sessionId)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to start QR pairing:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start QR pairing' },
      { status: 500 }
    )
  }
}
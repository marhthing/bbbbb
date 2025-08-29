import { NextRequest, NextResponse } from 'next/server'
import { whatsappService } from '../../../../../lib/whatsapp-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const body = await request.json()
    const { code } = body
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }
    
    if (!code) {
      return NextResponse.json(
        { error: 'Pairing code is required' },
        { status: 400 }
      )
    }
    
    // Submit pairing code
    const result = await whatsappService.submitPairingCode(sessionId, code)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to submit pairing code:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit pairing code' },
      { status: 500 }
    )
  }
}
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export async function POST() {
  try {
    // Generate session ID with MATDEV prefix
    const randomPart = uuidv4().split('-').join('').substring(0, 12).toUpperCase()
    const sessionId = `MATDEV-${randomPart}`
    
    return NextResponse.json({
      sessionId,
      message: 'Session ID generated successfully'
    })
  } catch (error) {
    console.error('Failed to generate session ID:', error)
    return NextResponse.json(
      { error: 'Failed to generate session ID' },
      { status: 500 }
    )
  }
}
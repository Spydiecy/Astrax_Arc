import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    console.log("Fetching My Backend API............");
    
    const body = await request.json()
    const { appName, userId, state, events } = body

    if (!appName || !userId) {
      return NextResponse.json({ error: "appName and userId are required" }, { status: 400 })
    }

    // Call your actual API endpoint
    const response = await fetch(`${process.env.API_BASE_URL || 'https://your-api-domain.com'}/apps/sonic_agent/users/${userId}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add any required headers like API keys
        ...(process.env.API_KEY && { "Authorization": `Bearer ${process.env.API_KEY}` }),
      },
      body: JSON.stringify({
        state: state || {},
        events: events || [],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("API Error:", response.status, errorText)
      return NextResponse.json(
        { error: `Failed to create session: ${response.status}` },
        { status: response.status }
      )
    }

    const sessionData = await response.json()
    return NextResponse.json(sessionData)
  } catch (error) {
    console.error("Session creation error:", error)
    return NextResponse.json(
      { error: "Internal server error while creating session" },
      { status: 500 }
    )
  }
}
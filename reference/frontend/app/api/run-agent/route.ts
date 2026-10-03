import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("my body Params Coming are:::::",body);
    console.log("my parts are:::",body.newMessage["parts"]);
    
    const { appName, userId, sessionId, newMessage, streaming } = body

    if (!appName || !userId || !sessionId || !newMessage) {
      return NextResponse.json(
        { error: "appName, userId, sessionId, and newMessage are required" },
        { status: 400 }
      )
    }

    // Call your actual API endpoint
    const response = await fetch(`${process.env.API_BASE_URL || 'https://your-api-domain.com'}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add any required headers like API keys
      },
      body: JSON.stringify({
        "appName":"sonic_agent",
        userId,
        sessionId,
        newMessage,
        streaming: streaming || false,
      }),
    })

    console.log("My Response Data is coming is::::::::",response);
    if (!response.ok) {
      const errorText = await response.text()
      console.error("API Error:", response.status, errorText)
      return NextResponse.json(
        { error: `Failed to run agent: ${response.status}` },
        { status: response.status }
      )
    }
    console.log("My Response  is Coming is::::::::",response);
    
    const responseData = await response.json()
    
    return NextResponse.json(responseData)
  } catch (error) {
    console.error("Agent run error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

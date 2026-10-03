import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

export async function POST(req: Request) {
  try {
    const { prompt, model } = await req.json();

    if (!prompt || !model) {
      return NextResponse.json({ error: "Missing prompt or model" }, { status: 400 });
    }

    const response = await fetch("https://anura-testnet.lilypad.tech/api/v1/image/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer anr_e68c5cc53bb626358e0c12a8dd9877ac30783867a445f352b2682bfaada7c1d3`,
      },
      body: JSON.stringify({ prompt, model }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to generate image" }, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to local directory
    const fileName = `generated_image_${Date.now()}.png`;
    const filePath = path.join(process.cwd(), fileName);
    await writeFile(filePath, buffer);
    console.log(`✅ Image saved locally at: ${filePath}`);

    return NextResponse.json({
      message: "Image generated and saved successfully.",
      filePath,
      fileName,
      jobOfferId: response.headers.get("Job-Offer-Id") || "",
    });
  } catch (error) {
    console.error("Error generating image:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

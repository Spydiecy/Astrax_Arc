import { createHash } from "crypto"

// You'll need to install and configure the Pinata client
// npm install pinata-web3
import { PinataSDK } from "pinata"

function createPinataClient() {
  return new PinataSDK({
    pinataJwt: process.env.NEXT_PUBLIC_PINATA_JWT!,
    pinataGateway: "example-gateway.mypinata.cloud",
  })
}

export async function uploadJSONToIPFS(jsonMetadata: any): Promise<{ ipfsUrl: string; contentHash: string }> {
  const pinata = createPinataClient()
  
  try {
    const  IpfsHash  = await pinata.upload.json(jsonMetadata)
    const contentHash = createHash("sha256")
      .update(JSON.stringify(jsonMetadata))
      .digest("hex")
    
    return {
      ipfsUrl: `https://ipfs.io/ipfs/${IpfsHash}`,
      contentHash: `0x${contentHash}`,
    }
  } catch (error) {
    console.error("Failed to upload JSON to IPFS:", error)
    throw new Error(`IPFS upload failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}
// function to be implemented soon->>>>>>>>
// export async function fetchImageUrl(cid:any){
//     try {
//     let p=await createPinataClient();
//       const url = await p.gateways.createSignedURL({
//         gateway:"violet-wrong-herring-709.mypinata.cloud",
//          cid: cid,
//           expires: 1800000000000,
//       })
//       console.log(url);
//       return url;
  
//     } catch (error) {
//       console.log(error);
//       return "";
//     }
  
//   }
export async function uploadFileToIPFS(file: File): Promise<{ ipfsUrl: string; contentHash: string }> {
  const pinata = new PinataSDK({
    pinataJwt: process.env.NEXT_PUBLIC_PINATA_JWT!,
    pinataGateway: "example-gateway.mypinata.cloud",
  });
  
  try {
    const  IpfsHash  = await pinata.upload.file(file)
    
    // Create content hash from file buffer
    console.log("My IPFS Hash Coming From Pinata Storage is::::",IpfsHash);    
    
    return {
      ipfsUrl: `https://ipfs.io/ipfs/${IpfsHash.cid}`,
      contentHash: `0xxx`,
    }
  } catch (error) {
    console.error("Failed to upload file to IPFS:", error)
    throw new Error(`IPFS upload failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

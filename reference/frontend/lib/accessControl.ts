// Access Control Contract Configuration
export const ACCESS_CONTROL_CONFIG = {
  contractAddress: '0xc60E29FDdf01b9E15CDa524B48991B33bFa0E0FD',
  subscriptionFee: '100000000000000000', // 0.1 S in wei (0.1 * 10^18)
  chainId: 14601, // Sonic Testnet
  gasLimit: BigInt(100000), // Set reasonable gas limit
}

/**
 * Format S amount for display
 */
export function formatSonic(wei: string | bigint): string {
  const value = typeof wei === 'string' ? wei : wei.toString()
  const s = Number(value) / 10**18
  return s.toFixed(4)
}

// Simplified ABI for the access control contractalr
export const ACCESS_CONTROL_ABI = [
	{
		"inputs": [],
		"name": "pay",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [],
		"name": "withdraw",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "user",
				"type": "address"
			}
		],
		"name": "hasPaid",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "paid",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
] as const

export interface SubscriptionStatus {
  hasAccess: boolean
  isLoading: boolean
}

/**
 * Check if a user has active subscription
 * @param address User's wallet address
 * @param readContract Function to read from contract
 * @returns SubscriptionStatus
 */
export async function checkSubscriptionStatus(
  address: `0x${string}`,
  readContract: (config: any) => Promise<any>
): Promise<SubscriptionStatus> {
  try {
    const hasAccess = await readContract({
      address: ACCESS_CONTROL_CONFIG.contractAddress as `0x${string}`,
      abi: ACCESS_CONTROL_ABI,
      functionName: 'hasPaid',
      args: [address],
    })

    return {
      hasAccess: Boolean(hasAccess),
      isLoading: false
    }
  } catch (error) {
    console.error('Error checking subscription status:', error)
    return {
      hasAccess: false,
      isLoading: false
    }
  }
}

/**
 * Subscribe to the platform
 * @param writeContract Function to write to contract
 * @returns Transaction hash
 */
export async function subscribeToAccess(
  writeContract: (config: any) => Promise<any>
): Promise<string> {
  try {
    const txHash = await writeContract({
      address: ACCESS_CONTROL_CONFIG.contractAddress as `0x${string}`,
      abi: ACCESS_CONTROL_ABI,
      functionName: 'pay',
      value: BigInt(ACCESS_CONTROL_CONFIG.subscriptionFee),
      gas: ACCESS_CONTROL_CONFIG.gasLimit,
    })

    return txHash
  } catch (error) {
    console.error('Error subscribing:', error)
    throw error
  }
}

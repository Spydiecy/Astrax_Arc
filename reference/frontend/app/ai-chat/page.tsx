"use client"
import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Paperclip, Send, Bot, User, Plus, Zap, ImageIcon, Wallet, Mic, MicOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { uploadFileToIPFS } from "@/lib/pinata"
import { useCredentials } from "@/contexts/CredentialsContext"
import { AccessControlModal } from "@/components/access-control-modal"
import { useAccount } from 'wagmi'
import CandlestickChart from "@/components/ui/candlestick-chart"
import TokenListCard from "@/components/ui/token-list-card"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  isLoading?: boolean
  images?: Array<{
    data: string
    displayName: string
    mimeType: string
  }>
  generatedImage?: any
  balanceData?: {
    tokens: Array<{
      symbol: string
      name: string
      balance: string
      usdValue?: string
      icon?: string
    }>
    totalUsdValue?: string
  }
  candlestickData?: {
    symbol: string
    data: Array<{
      timestamp: number
      open: number
      high: number
      low: number
      close: number
      volume: number
    }>
  }
  tokenListData?: {
    tokens: Array<{
      symbol: string
      name: string
      address: string
      icon?: string
    }>
  }
  transactionData?: {
    hash: string
    blockHash: string
    blockNumber: string
    chainId: string
    from: string
    to: string
    value: string
    gasUsed: string
    gasPrice: string
    nonce: string
    transactionIndex: string
    type: string
    status?: string
    timestamp?: string
  }
  blockData?: {
    blockNumber: string
    blockHash: string
    timestamp: string
    transactionCount: string
    gasUsed: string
    gasLimit: string
    miner?: string
    difficulty?: string
    size?: string
    parentHash?: string
  }
  swapData?: {
    id: string
    status: string
    fromCurrency: string
    toCurrency: string
    expectedSendAmount: string
    expectedReceiveAmount: string
    depositAddress: string
    recipientAddress: string
    createdAt: string
    updatedAt?: string
  }
}

interface FileUpload {
  file: File
  displayName: string
  mimeType: string
  data: string
}

export default function AstraChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>("")
  const [appName, setAppName] = useState<string>("")
  const [uploadedFiles, setUploadedFiles] = useState<FileUpload[]>([])
  const [showAccessModal, setShowAccessModal] = useState(true)
  const [isRecording, setIsRecording] = useState(false)

  // Get credentials from context (includes subscription access check)
  const { 
    publicKey, 
    privateKey, 
    hasCredentials, 
    isConfirmed, 
    hasAccess, 
    isCheckingAccess 
  } = useCredentials()
  
  // Wallet connection
  const { address, isConnected } = useAccount()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const imageGenerationKeywords = [
    "generate",
    "create",
    "draw",
    "sketch",
    "illustrate",
    "visualize",
    "diagram",
    "chart",
    "graph",
    "workflow",
    "flowchart"
  ]

  // Keywords that trigger smart contract workflow generation
  const smartContractWorkflowKeywords = [
    "smart contract",
    "contract code",
    "solidity",
    "workflow",
    "contract workflow",
    "contract diagram",
    "function flow",
    "contract structure",
    "contract functions",
    "contract logic",
    "show contract",
    "explain contract",
    "contract details",
    "how does this contract work",
    "contract flow"
  ]

  // Keywords that trigger IPFS storage functionality
  const ipfsStorageKeywords = [
    "save asset",
    "store asset",
    "save nft",
    "store nft",
    "upload asset",
    "upload nft",
    "mint nft",
    "create nft",
    "store metadata",
    "save metadata",
  ]

  const shouldGenerateImage = (text: string): boolean => {
    const lowerText = text.toLowerCase()
    
    // EXCEPTIONS: Don't generate images for payment link requests
    const paymentLinkExceptions = [
      'generate a payment link',
      'create a payment link',
      'make a payment link',
      'payment link for',
      'generate payment link',
      'create payment link'
    ]
    
    // Check for payment link exceptions first
    const isPaymentLinkRequest = paymentLinkExceptions.some(exception => 
      lowerText.includes(exception)
    )
    
    if (isPaymentLinkRequest) {
      return false // Don't generate images for payment links
    }
    
    return imageGenerationKeywords.some((keyword) => lowerText.includes(keyword))
  }

  const shouldGenerateWorkflowDiagram = (text: string, userInput: string, aiResponse: string): boolean => {
    const lowerUserInput = userInput.toLowerCase()
    const lowerAiResponse = aiResponse.toLowerCase()
    
    // EXCEPTIONS: Don't generate workflow diagrams for these specific requests
    const paymentLinkExceptions = [
      'generate a payment link',
      'create a payment link',
      'make a payment link',
      'payment link for',
      'generate payment link',
      'create payment link'
    ]
    
    // Check for payment link exceptions first
    const isPaymentLinkRequest = paymentLinkExceptions.some(exception => 
      lowerUserInput.includes(exception)
    )
    
    if (isPaymentLinkRequest) {
      return false // Don't generate workflow diagram for payment links
    }
    
    // Check if user asked for contract-related information
    const userAskedForContract = smartContractWorkflowKeywords.some(keyword => 
      lowerUserInput.includes(keyword)
    )
    
    // Check if AI response contains contract code (Solidity patterns)
    const hasContractCode = (
      lowerAiResponse.includes('pragma solidity') ||
      lowerAiResponse.includes('contract ') ||
      lowerAiResponse.includes('function ') ||
      lowerAiResponse.includes('mapping(') ||
      lowerAiResponse.includes('modifier ') ||
      lowerAiResponse.includes('event ') ||
      lowerAiResponse.includes('struct ') ||
      lowerAiResponse.includes('enum ') ||
      (lowerAiResponse.includes('{') && lowerAiResponse.includes('}') && lowerAiResponse.includes(';'))
    )
    
    return userAskedForContract && hasContractCode
  }

  const shouldUseIPFSStorage = (text: string): boolean => {
    const lowerText = text.toLowerCase()
    return ipfsStorageKeywords.some((keyword) => lowerText.includes(keyword))
  }

  const isBlockResponse = (text: string, userInput?: string): boolean => {
    const lowerText = text.toLowerCase()
    const lowerUserInput = userInput?.toLowerCase() || ''
    
    // Check for block information keywords
    const blockKeywords = [
      'latest block', 'recent block', 'current block', 'block information',
      'block details', 'newest block', 'last block', 'block height',
      'block number', 'block data', 'block info', 'block hash',
      'block timestamp', 'block size', 'block miner'
    ]
    
    const hasBlockKeyword = blockKeywords.some(keyword => 
      lowerUserInput.includes(keyword) || lowerText.includes(keyword)
    )
    
    // Check for block-specific patterns in the response
    const hasBlockPattern = (
      lowerText.includes('block #') ||
      lowerText.includes('block number:') ||
      lowerText.includes('block hash:') ||
      lowerText.includes('timestamp:') ||
      lowerText.includes('transaction count:') ||
      lowerText.includes('gas used:') ||
      lowerText.includes('gas limit:')
    )
    
    // Check for numerical values that look like block data
    const hasBlockData = /block\s*#?\s*\d+|timestamp.*\d+|gas.*\d+/i.test(text)
    
    return hasBlockKeyword && (hasBlockPattern || hasBlockData)
  }

  const parseBlockData = (text: string) => {
    const patterns = {
      blockNumber: /(?:block\s*#?\s*|block\s+number\s*:?\s*)(\d+)/i,
      blockHash: /(?:block\s+hash\s*:?\s*|hash\s*:?\s*)([a-fA-F0-9x]{64,66})/i,
      timestamp: /(?:timestamp\s*:?\s*|time\s*:?\s*)([^\n,]+)/i,
      transactionCount: /(?:transaction\s+count\s*:?\s*|transactions\s*:?\s*)(\d+)/i,
      gasUsed: /(?:gas\s+used\s*:?\s*)([0-9,]+)/i,
      gasLimit: /(?:gas\s+limit\s*:?\s*)([0-9,]+)/i,
      miner: /(?:miner\s*:?\s*|validator\s*:?\s*)([a-fA-F0-9x]{40,42})/i,
      difficulty: /(?:difficulty\s*:?\s*)([0-9,]+)/i,
      size: /(?:size\s*:?\s*)([0-9,]+\s*bytes?)/i,
      parentHash: /(?:parent\s+hash\s*:?\s*)([a-fA-F0-9x]{64,66})/i
    }

    const result: any = {}
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern)
      if (match) {
        result[key] = match[1].trim()
      }
    }

    console.log('Block parsing debug:', {
      foundFields: Object.keys(result),
      result,
      textSample: text.substring(0, 300)
    })

    // Return if we have at least block number or hash
    if (result.blockNumber || result.blockHash || Object.keys(result).length >= 2) {
      return result
    }

    return null
  }

  const isBalanceResponse = (text: string, userInput?: string): boolean => {
    const lowerText = text.toLowerCase()
    const lowerUserInput = userInput?.toLowerCase() || ''
    
    // Check if this is a send/transfer operation - if so, don't show balance card
    const sendTransferKeywords = ['send', 'transfer', 'pay', 'transmit']
    const isSendTransferQuery = sendTransferKeywords.some(keyword => 
      lowerUserInput.includes(keyword)
    )
    
    if (isSendTransferQuery) {
      return false // Don't show balance card for send/transfer operations
    }
    
    // Check if this is a transaction details response - if so, don't show balance card
    const transactionIndicators = [
      'transaction details',
      'details for transaction',
      'transaction hash',
      'from address',
      'to address',
      'gas used:',
      'gas price:',
      'block number:',
      '**from:**',
      '**to:**',
      '**value:**',
      '**gas used:**',
      '**gas price:**',
      '**block number:**',
      'transaction sent',
      'transaction successful',
      'transaction completed',
      'sent successfully',
      'transfer successful',
      'transfer completed'
    ]
    const isTransactionResponse = transactionIndicators.some(indicator => 
      lowerText.includes(indicator)
    )
    
    if (isTransactionResponse) {
      return false // Don't show balance card for transaction responses
    }

    // Check if user is asking about balance
    const userBalanceKeywords = [
      'balance',
      'my wallet',
      'show wallet',
      'wallet balance',
      'check balance',
      'what do i have',
      'how much do i have',
    ]
    
    const userAskedForBalance = userBalanceKeywords.some(keyword => 
      lowerUserInput.includes(keyword)
    )
    
    // Check for specific balance response patterns
    const balanceKeywords = [
      'wallet balance is',
      'balance is',
      'your balance',
      'current balance',
      'account balance',
      'balance:',
  'sonic balance',
  's token balance',
  'sonic balance',
  's token balance',
      'show balance',
      'check balance',
      'my balance',
      'you have',
      'your wallet contains',
      'wallet shows',
      'available balance',
      'total balance'
    ]
    
    const hasBalanceKeyword = balanceKeywords.some(keyword => lowerText.includes(keyword))
    
    // Only check for broader patterns if we have specific balance keywords or user asked for balance
    // and it's not a transaction response
    const hasNumericValue = /[\d.]+/.test(text)
    
    return (hasBalanceKeyword || userAskedForBalance) && hasNumericValue
  }

  const parseBalanceData = async (text: string, userInput?: string) => {
    console.log('Parsing balance data for text:', text)
    // Try to extract balance information from the AI response
    const tokens: Array<{
      symbol: string
      name: string
      balance: string
      usdValue: string
      icon: string
    }> = []
    
    // Enhanced patterns for better balance extraction
    const patterns = [
      // Pattern: "Your current wallet balance is: 1.9069453"
      /your\s+current\s+wallet\s+balance\s+is:\s*([\d.,]+)/gi,
      // Pattern: "Your wallet balance is: 1.9069453"
      /your\s+wallet\s+balance\s+is:\s*([\d.,]+)/gi,
      // Pattern: "Wallet balance is: 1.9069453"
      /wallet\s+balance\s+is:\s*([\d.,]+)/gi,
      // Pattern: "Current wallet balance is: 1.9069453"
      /current\s+wallet\s+balance\s+is:\s*([\d.,]+)/gi,
      // Pattern: "Wallet Balance0.1" (exact concatenated format from backend)
      /^wallet\s*balance([\d.,]+)$/gi,
      // Pattern: "Your wallet balance is 0.609746632743044111"
      /(?:wallet\s+balance\s+is|balance\s+is)\s*([\d.,]+)/gi,
      // Pattern: "Balance: 0.1" (simple backend response format)
      /^balance:\s*([\d.,]+)$/gi,
      // Pattern: General "Wallet Balance" with spaces and numbers
      /wallet\s*balance\s*:?\s*([\d.,]+)/gi,
      // Pattern: "INJ: 2.64" or "USDT: 30.23"
      /(\w+):\s*([\d.,]+)/gi,
      // Pattern: "INJ balance: 2.64" 
      /(\w+)\s+balance:\s*([\d.,]+)/gi,
      // Pattern: "2.64 INJ" or "30.23 USDT"
      /([\d.,]+)\s+(\w+)/gi,
      // Pattern: "balance: 0.619957302943058765"
      /balance:\s*([\d.,]+)/gi,
  // Pattern: "S balance is 0.1" or "Sonic balance is 0.1"
  /(?:sonic|s)\s+balance\s+is\s*([\d.,]+)/gi,
  // Pattern: "Your S balance: 0.1"
  /(?:your\s+)?(?:sonic|s)\s+balance:\s*([\d.,]+)/gi
    ]
    
    // Common token symbols to look for
  const tokenSymbols = ['S', 'USDT', 'DAI', 'ETH', 'EURC', 'USDC', 'WBTC']
    
    let foundTokens = new Set() // To avoid duplicates
    
    // Process each pattern
    for (const [patternIndex, pattern] of patterns.entries()) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        let tokenSymbol, balanceValue
        
        if (match.length === 3) {
          // Two capture groups - could be symbol:balance or balance symbol
          const first = match[1].toUpperCase()
          const second = match[2]
          
          if (tokenSymbols.includes(first)) {
            tokenSymbol = first
            balanceValue = second
          } else if (tokenSymbols.includes(second.toUpperCase())) {
            tokenSymbol = second.toUpperCase()
            balanceValue = first
          }
        } else if (match.length === 2) {
          // One capture group - likely just a balance number
          balanceValue = match[1]
          
          // Enhanced token detection logic
          // Look for token symbols in the surrounding text
          tokenSymbol = tokenSymbols.find(symbol => 
            text.toUpperCase().includes(symbol)
          )
          
          // Enhanced context-based token detection
          if (!tokenSymbol) {
            const lowerText = text.toLowerCase()
            const userInputLower = userInput?.toLowerCase() || ''
            
            // Check for Sonic-related keywords first (from user input or AI response)
            if (lowerText.includes('sonic') || 
                lowerText.includes('s token') || lowerText.includes('s balance') ||
                lowerText.includes('show s') || lowerText.includes('tell my balance') ||
                lowerText.includes('my s') ||
                userInputLower.includes('sonic') ||
                userInputLower.includes('s token') || userInputLower.includes('s balance')) {
              tokenSymbol = 'S'
            }
            // Check for other specific token contexts
            else if (lowerText.includes('sonic') || text.includes('0x') ||
                     userInputLower.includes('sonic')) {
              tokenSymbol = 'S'
            } else if (lowerText.includes('usdt') || lowerText.includes('tether') ||
                       userInputLower.includes('usdt') || userInputLower.includes('tether')) {
              tokenSymbol = 'USDT'
            } else if (lowerText.includes('ethereum') || lowerText.includes('eth') ||
                       userInputLower.includes('ethereum') || userInputLower.includes('eth')) {
              tokenSymbol = 'ETH'
            } else {
              // For simple "Wallet Balance" or "Balance:" responses, default to S since this is a Sonic project
              // Also handle generic balance responses like "Your current wallet balance is: X"
              if (patternIndex <= 5 || // First few patterns are wallet balance patterns
                  text.trim().startsWith('Balance:') || 
                  text.trim().startsWith('Wallet Balance') ||
                  lowerText.includes('current wallet balance') ||
                  lowerText.includes('wallet balance is') ||
                  userInputLower.includes('balance') ||
                  userInputLower.includes('wallet')) {
                tokenSymbol = 'S'
              } else {
                // Default fallback for any balance-like response
                tokenSymbol = 'S'
              }
            }
          }
        }
        
        if (tokenSymbol && balanceValue && !foundTokens.has(tokenSymbol)) {
          foundTokens.add(tokenSymbol)
          
          const cleanBalance = parseFloat(balanceValue.replace(/,/g, ''))
          if (!isNaN(cleanBalance)) {
            const usdValue = await calculateUSDValue(tokenSymbol, cleanBalance)
            tokens.push({
              symbol: tokenSymbol,
              name: getTokenFullName(tokenSymbol),
              balance: cleanBalance.toFixed(6),
              usdValue: usdValue,
              icon: getTokenIcon(tokenSymbol)
            })
          }
        }
      }
    }

    // Calculate total USD value
    let totalUsdValue = '0.00'
    if (tokens.length > 0) {
      const total = tokens.reduce((sum, token) => {
        return sum + parseFloat(token.usdValue || '0')
      }, 0)
      totalUsdValue = total.toFixed(2)
    }

    return tokens.length > 0 ? { tokens, totalUsdValue } : null
  }

  const getTokenFullName = (symbol: string): string => {
    const tokenNames: Record<string, string> = {
  'S': 'Sonic Token',
      'DAI': 'Dai Stablecoin',
      'ETH': 'Ethereum',
      'USDC': 'USD Coin',
      'USDT': 'Tether USD',
      'WBTC': 'Wrapped Bitcoin'
    }
    return tokenNames[symbol] || symbol
  }

  const calculateUSDValue = async (symbol: string, balance: number): Promise<string> => {
    try {
      // Map token symbols to Coinbase API symbols
      const coinbaseSymbols: Record<string, string> = {
  'S': 'S-USD', // Map S to Sonic price
        'DAI': 'DAI-USD',
        'ETH': 'ETH-USD',
        'EURC': 'EURC-USD',
        'USDC': 'USDC-USD',
        'USDT': 'USDT-USD',
        'WBTC': 'BTC-USD'
      }
      
      const coinbaseSymbol = coinbaseSymbols[symbol]
      
      if (!coinbaseSymbol) {
        // Fallback to mock price for unsupported tokens only
        const mockPrices: Record<string, number> = {
          'AGENT': 0.50,
          'OSMO': 0.80
        }
        const price = mockPrices[symbol] || 0
        return (balance * price).toFixed(2)
      }
      
      const response = await fetch(`https://api.coinbase.com/v2/prices/${coinbaseSymbol}/spot`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch price for ${symbol}`)
      }
      
      const data = await response.json()
      const price = parseFloat(data.data.amount)
      
      return (balance * price).toFixed(2)
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error)
      
      // Fallback to mock prices if API fails
      const mockPrices: Record<string, number> = {
  'USDT': 1.00,
  'S': 0.80, // Fallback Sonic price
        'ETH': 3200.00,
        'DAI': 1.00,
        'EURC': 1.08,
        'USDC': 1.00,
        'WBTC': 45000.00
      }
      
      const price = mockPrices[symbol] || 0
      return (balance * price).toFixed(2)
    }
  }

  const getTokenIcon = (symbol: string): string => {
    const tokenIcons: Record<string, string> = {
  'S': '/s.svg',
      'DAI': '/dai.png', 
      'ETH': '/eth.svg',
      'USDC': '/usdc.png',
      'USDT': '/usdt.png',
      'WBTC': '/wbtc.png'
    }
    return tokenIcons[symbol] || '🪙'
  }

  const isCandlestickResponse = (text: string, userInput?: string): boolean => {
    const lowerText = text.toLowerCase()
    const lowerUserInput = userInput?.toLowerCase() || ''
    
    // Check for candlestick-related keywords in user input
    const candlestickKeywords = [
      'candlestick', 'candle', 'ohlc', 'price chart', 'chart', 'price data',
      'price history', 'historical price', 'price movement'
    ]
    
    const hasCandlestickKeyword = candlestickKeywords.some(keyword => 
      lowerUserInput.includes(keyword)
    )
    
    // Check if response contains structured price data
    const hasPriceData = (
      lowerText.includes('open') && 
      lowerText.includes('high') && 
      lowerText.includes('low') && 
      lowerText.includes('close') &&
      lowerText.includes('volume')
    )
    
    // Check for tabular data format
    const hasTabularData = (
      text.includes('Date') && 
      text.includes('Open') && 
      text.includes('High') && 
      text.includes('Low') && 
      text.includes('Close') &&
      text.includes('Volume')
    )
    
    return hasCandlestickKeyword && (hasPriceData || hasTabularData)
  }

  const parseCandlestickData = (text: string, userInput?: string) => {
    try {
      // Extract symbol from user input
      const symbolMatch = userInput?.match(/(?:candlestick|chart|price).*?(?:of|for)\s+(\w+)/i) ||
                          userInput?.match(/(\w+).*?(?:candlestick|chart|price)/i)
      const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : 'UNKNOWN'
      
      // Parse markdown table data
      const lines = text.split('\n').filter(line => line.trim())
      const data: Array<{
        timestamp: number
        open: number
        high: number
        low: number
        close: number
        volume: number
      }> = []
      
      for (const line of lines) {
        // Skip header lines, separator lines, and non-data lines
        if (line.includes('Timestamp') || line.includes('---') || 
            line.includes('Open') || line.includes('High') || 
            !line.includes('|') || line.trim().startsWith('|---')) {
          continue
        }
        
        // Parse markdown table row: | Timestamp | Open | High | Low | Close | Volume | ... |
        const parts = line.split('|').map(part => part.trim()).filter(part => part)
        
        if (parts.length >= 6) {
          const timestamp = parseInt(parts[0])
          const open = parseFloat(parts[1])
          const high = parseFloat(parts[2])
          const low = parseFloat(parts[3])
          const close = parseFloat(parts[4])
          const volume = parseFloat(parts[5]) // Volume could be in different columns
          
          if (!isNaN(timestamp) && !isNaN(open) && !isNaN(high) && 
              !isNaN(low) && !isNaN(close) && !isNaN(volume)) {
            data.push({ timestamp, open, high, low, close, volume })
          }
        }
      }
      
      // Also try to parse the old format (space-separated values)
      if (data.length === 0) {
        for (const line of lines) {
          // Skip header lines and non-data lines
          if (line.includes('Date') || line.includes('---') || !line.match(/^\d/)) {
            continue
          }
          
          // Parse data line (expects: timestamp, open, high, low, close, volume)
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 6) {
            const timestamp = parseInt(parts[0])
            const open = parseFloat(parts[1])
            const high = parseFloat(parts[2])
            const low = parseFloat(parts[3])
            const close = parseFloat(parts[4])
            const volume = parseFloat(parts[5])
            
            if (!isNaN(timestamp) && !isNaN(open) && !isNaN(high) && 
                !isNaN(low) && !isNaN(close) && !isNaN(volume)) {
              data.push({ timestamp, open, high, low, close, volume })
            }
          }
        }
      }
      
      console.log('Parsed candlestick data:', { symbol, dataLength: data.length, sampleData: data.slice(0, 3) })
      
      return data.length > 0 ? { symbol, data } : null
    } catch (error) {
      console.error('Error parsing candlestick data:', error)
      return null
    }
  }

  const isTokenListResponse = (text: string, userInput?: string): boolean => {
    const lowerText = text.toLowerCase()
    const lowerUserInput = userInput?.toLowerCase() || ''
    
    // Check for token list keywords in user input
    const tokenListKeywords = [
      'list tokens', 'all tokens', 'supported tokens', 'available tokens',
      'token list', 'tokens on', 'what tokens', 'which tokens'
    ]
    
    const hasTokenListKeyword = tokenListKeywords.some(keyword => 
      lowerUserInput.includes(keyword)
    )
    
    // Check if response contains token information with addresses
    const hasTokenData = (
      lowerText.includes('token') && 
      lowerText.includes('0x') &&
      (lowerText.includes('usdt') || lowerText.includes('usdc') || lowerText.includes('sonic'))
    )
    
    // Check for supported tokens format
    const hasSupportedTokensFormat = lowerText.includes('supported tokens')
    
    return hasTokenListKeyword && (hasTokenData || hasSupportedTokensFormat)
  }

  const parseTokenListData = (text: string, userInput?: string) => {
    try {
      const tokens: Array<{
        symbol: string
        name: string
        address: string
        icon?: string
      }> = []
      
      // Parse markdown list format
      const lines = text.split('\n').filter(line => line.trim())
      
      for (const line of lines) {
        // Look for lines with token info: "* **Token Name (SYMBOL)** - 0x..."
        const tokenMatch = line.match(/\*\s*\*\*([^(]+)\(([^)]+)\)\*\*\s*-\s*(0x[a-fA-F0-9]{40}|0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)/i)
        
        if (tokenMatch) {
          const name = tokenMatch[1].trim()
          const symbol = tokenMatch[2].trim()
          const address = tokenMatch[3].trim()
          
          tokens.push({
            symbol,
            name,
            address,
            icon: getTokenIcon(symbol)
          })
        }
      }
      
      return tokens.length > 0 ? { tokens } : null
    } catch (error) {
      console.error('Error parsing token list data:', error)
      return null
    }
  }

  const isTransactionResponse = (text: string, userInput?: string): boolean => {
    const lowerText = text.toLowerCase()
    const lowerUserInput = userInput?.toLowerCase() || ''
    
    // Check if this is a block information query - if so, don't show transaction card
    const blockInfoKeywords = [
      'latest block', 'recent block', 'current block', 'block information', 
      'block details', 'newest block', 'last block', 'block height',
      'block number', 'block data', 'block info'
    ]
    const isBlockInfoQuery = blockInfoKeywords.some(keyword => 
      lowerUserInput.includes(keyword)
    )
    
    if (isBlockInfoQuery) {
      return false // Don't show transaction card for block information queries
    }
    
    // Check for send/transfer operations in user input - these should show transaction cards
    const sendTransferKeywords = ['send', 'transfer', 'pay', 'transmit']
    const isSendTransferQuery = sendTransferKeywords.some(keyword => 
      lowerUserInput.includes(keyword)
    )
    
    // Check for transaction-related keywords including markdown bold format
    const transactionKeywords = [
      'transaction',
      'transaction hash',
      'gas used',
      'gas price',
      'transaction index',
      'from address',
      'to address',
      'chain id',
      'nonce',
      '**from address:**',
      '**to address:**',
      '**gas used:**',
      '**gas price:**',
      '**hash:**',
      '**nonce:**',
      '**transaction index:**',
      '**type:**',
      '**value:**',
      'tx hash',
      'txn hash',
      'transaction details',
      'transaction sent',
      'transaction successful',
      'transaction completed',
      'sent successfully',
      'transfer successful',
      'transfer completed'
    ]
    
    const hasTransactionKeyword = transactionKeywords.some(keyword => lowerText.includes(keyword))
    
    // Check for transaction hash pattern (various formats)
    const hasTransactionHash = /[a-fA-F0-9]{64}/.test(text) || /0x[a-fA-F0-9]{64}/.test(text)
    
    // Check for address patterns (0x followed by 40 hex characters)
    const hasAddress = /0x[a-fA-F0-9]{40}/.test(text)
    
    // Check for the specific phrase about transaction details
    const hasTransactionPhrase = lowerText.includes('details for the transaction') || 
                                 lowerText.includes('transaction with hash') ||
                                 lowerText.includes('here are the details') ||
                                 lowerText.includes('transaction information') ||
                                 lowerText.includes('sent successfully') ||
                                 lowerText.includes('transfer completed') ||
                                 lowerText.includes('transaction completed')
    
    // Enhanced detection logic:
    // 1. If user asked to send/transfer AND we have transaction keywords OR hash, show card
    // 2. If we have transaction keywords AND any identifying data, show card
    const result = (isSendTransferQuery && (hasTransactionKeyword || hasTransactionHash)) || 
                   (hasTransactionKeyword && (hasTransactionHash || hasAddress || hasTransactionPhrase))
    
    console.log('Transaction detection debug:', {
      hasTransactionKeyword,
      hasTransactionHash,
      hasAddress,
      hasTransactionPhrase,
      isSendTransferQuery,
      isBlockInfoQuery,
      result,
      textSample: lowerText.substring(0, 200)
    })
    
    return result
  }

  const parseTransactionData = (text: string) => {
    const patterns = {
      hash: /(?:\*\*Hash:\*\*|\*\*Transaction Hash:\*\*|hash|transaction\s+(?:hash\s+)?(?:is\s+)?|tx\s*hash|txn\s*hash|transaction\s+([a-fA-F0-9x]{64,66})|sent\s+successfully.*?([a-fA-F0-9x]{64,66})|transaction\s+completed.*?([a-fA-F0-9x]{64,66}))[\s:`"]*([a-fA-F0-9x]{64,66})/i,
      blockHash: /(?:\*\*Block\s+Hash:\*\*|block\s+hash)[\s:`"]*([a-fA-F0-9x]+)/i,
      blockNumber: /(?:\*\*Block\s+Number:\*\*|block\s+number)[\s:`"]*[#]?(\d+)/i,
      chainId: /(?:\*\*Chain\s+ID:\*\*|chain\s+id)[\s:`"]*(\d+)/i,
      from: /(?:\*\*From[\s\w]*:\*\*|from[\s\w]*address)[\s:`"]*([a-fA-F0-9x]{40,42})/i,
      to: /(?:\*\*To[\s\w]*:\*\*|to[\s\w]*address)[\s:`"]*([a-fA-F0-9x]{40,42})/i,
      value: /(?:\*\*Value:\*\*|value|amount)[\s:`"]*(\d+(?:\.\d+)?\s*(?:S|sonic|wei?)?|\d+)/i,
      gasUsed: /(?:\*\*Gas\s+Used:\*\*|gas\s+used)[\s:`"]*(\d+)/i,
      gasPrice: /(?:\*\*Gas\s+Price:\*\*|gas\s+price)[\s:`"]*(\d+)\s*(?:wei?|gwei)?/i,
      nonce: /(?:\*\*Nonce:\*\*|nonce)[\s:`"]*(\d+)/i,
      transactionIndex: /(?:\*\*Transaction\s+Index:\*\*|transaction\s+index)[\s:`"]*(\d+)/i,
      type: /(?:\*\*Type:\*\*|type)[\s:`"]*(\d+)/i
    }

    const result: any = {}
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern)
      if (match) {
        if (key === 'hash') {
          // For hash, find the actual hash value from all capture groups
          for (let i = match.length - 1; i >= 1; i--) {
            if (match[i] && /^0x[a-fA-F0-9]{64}$/.test(match[i])) {
              result[key] = match[i]
              break
            }
          }
          // If no proper hash found, take the last capture group
          if (!result[key] && match[match.length - 1]) {
            result[key] = match[match.length - 1]
          }
        } else {
          result[key] = match[1]
        }
      }
    }

    // Additional hash detection patterns for send/transfer operations
    if (!result.hash) {
      const hashPatterns = [
        /transaction\s+hash:\s*([a-fA-F0-9x]{64,66})/i,
        /hash:\s*([a-fA-F0-9x]{64,66})/i,
        /sent.*?([a-fA-F0-9x]{64,66})/i,
        /transfer.*?([a-fA-F0-9x]{64,66})/i,
        /transaction.*?([a-fA-F0-9x]{64,66})/i,
        /([a-fA-F0-9x]{64,66})/i  // Fallback: any 64-66 character hex string
      ]
      
      for (const pattern of hashPatterns) {
        const match = text.match(pattern)
        if (match && match[1]) {
          result.hash = match[1]
          break
        }
      }
    }

    console.log('Transaction parsing debug:', {
      foundFields: Object.keys(result),
      result,
      textSample: text.substring(0, 300)
    })

    // Return if we have at least a hash OR any meaningful transaction data
    if (result.hash || Object.keys(result).length >= 2) {
      return result
    }

    return null
  }

  const formatTransactionValue = (value: string): string => {
    if (!value) return '0'
    try {
      // Check if the value already includes S or is in S format
      if (value.toLowerCase().includes('sonic') || value.toLowerCase().includes('s')) {
        const numericValue = parseFloat(value.replace(/[^\d.]/g, ''))
        return numericValue.toFixed(6) + ' S'
      }
      
      // Check if it's wei (very large number) - Sonic uses standard 18 decimals
      const numericValue = parseFloat(value)
      if (numericValue > 1000000000000000000) {
        // Likely wei - convert to S (divide by 10^18 for Sonic)
        const sValue = numericValue / Math.pow(10, 18)
        return sValue.toFixed(6) + ' S'
      } else if (numericValue > 1000000) {
        // Medium large number - convert to S
        const sValue = numericValue / Math.pow(10, 18)
        return sValue.toFixed(6) + ' S'
      } else {
        // Already in S
        return numericValue.toFixed(6) + ' S'
      }
    } catch {
      return value
    }
  }

  const formatGasPrice = (gasPrice: string): string => {
    if (!gasPrice) return '0'
    try {
      const numericValue = parseFloat(gasPrice)
      
      // For Sonic, gas prices are typically in wei
      // 1 S = 10^18 wei
      if (numericValue >= 1000000000000000000) {
        // Large number - likely wei, convert to a reasonable display format
        if (numericValue >= 1000000000000000000000) {
          // Very large number - show in Gwei equivalent
          const gweiValue = numericValue / Math.pow(10, 9)
          return gweiValue.toFixed(2) + ' Gwei'
        } else {
          // Moderate large number - show in wei
          return numericValue.toLocaleString() + ' wei'
        }
      } else if (numericValue >= 1000000) {
        // Medium number - could be wei, convert to Gwei
        const gweiValue = numericValue / Math.pow(10, 9)
        return gweiValue.toFixed(2) + ' Gwei'
      } else {
        // Small number - show as is with wei unit
        return numericValue.toLocaleString() + ' wei'
      }
    } catch {
      return gasPrice
    }
  }

  const isSwapResponse = (text: string, userInput?: string): boolean => {
    const lowerText = text.toLowerCase()
    const lowerUserInput = userInput?.toLowerCase() || ''
    
    // Check for swap/exchange related keywords in user input
    const swapKeywords = [
      'swap', 'exchange', 'convert', 'trade',
      'swap status', 'exchange status', 'swap id', 'exchange id'
    ]
    
    const userAskedForSwap = swapKeywords.some(keyword => 
      lowerUserInput.includes(keyword)
    )
    
    // Check if response contains swap/exchange data patterns
    const hasSwapData = (
      lowerText.includes('exchange with id') ||
      lowerText.includes('swap with id') ||
      (lowerText.includes('status:') && 
       (lowerText.includes('from currency:') || lowerText.includes('to currency:'))) ||
      (lowerText.includes('deposit address') && lowerText.includes('recipient address')) ||
      (lowerText.includes('expected send amount') && lowerText.includes('expected receive amount'))
    )
    
    return userAskedForSwap && hasSwapData
  }

  const parseSwapData = (text: string) => {
    const patterns = {
      id: /(?:exchange with id|swap with id|id)\s*[`"']?([a-zA-Z0-9]+)[`"']?/i,
      status: /status:\s*([^\n\r*]+)/i,
      fromCurrency: /from currency:\s*([^\n\r*]+)/i,
      toCurrency: /to currency:\s*([^\n\r*]+)/i,
      expectedSendAmount: /expected send amount:\s*([^\n\r*]+)/i,
      expectedReceiveAmount: /expected receive amount:\s*([^\n\r*]+)/i,
      depositAddress: /deposit address.*?:\s*[`"']?([a-fA-F0-9x]{40,42})[`"']?/i,
      recipientAddress: /recipient address.*?:\s*[`"']?([a-fA-F0-9x]{40,42})[`"']?/i,
      createdAt: /created at:\s*([^\n\r*]+)/i,
      updatedAt: /updated at:\s*([^\n\r*]+)/i
    }

    const result: any = {}
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern)
      if (match) {
        result[key] = match[1].trim()
      }
    }

    console.log('Swap parsing debug:', {
      foundFields: Object.keys(result),
      result,
      textSample: text.substring(0, 300)
    })

    // Return if we have essential swap data
    if (result.id && (result.status || result.fromCurrency || result.toCurrency)) {
      return result
    }

    return null
  }

  const getSwapStatusColor = (status: string): string => {
    const lowerStatus = status.toLowerCase()
    if (lowerStatus.includes('waiting') || lowerStatus.includes('pending')) {
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
    } else if (lowerStatus.includes('processing') || lowerStatus.includes('confirming')) {
      return 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
    } else if (lowerStatus.includes('completed') || lowerStatus.includes('finished')) {
      return 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
    } else if (lowerStatus.includes('failed') || lowerStatus.includes('error')) {
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
    }
    return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
  }

  useEffect(() => {
    // Check access based on subscription status
    if (isConnected && address && hasAccess) {
      setShowAccessModal(false)
    } else {
      setShowAccessModal(true)
    }
  }, [isConnected, address, hasAccess])

  useEffect(() => {
    const storedSessionId = localStorage.getItem("sessionId")
    const storedUserId = localStorage.getItem("userId")
    const storedAppName = localStorage.getItem("appName")

    if (storedSessionId && storedUserId && storedAppName && hasAccess) {
      setSessionId(storedSessionId)
      setUserId(storedUserId)
      setAppName(storedAppName)
      initializeChat()
    }

    // Listen for new session events from the layout
    const handleNewSession = (event: CustomEvent) => {
      if (!hasAccess) return // Don't create session if no access
      
      console.log('New session created:', event.detail)
      const { sessionId: newSessionId, userId: newUserId } = event.detail
      setSessionId(newSessionId)
      setUserId(newUserId)
      setAppName(localStorage.getItem("appName") || "astra-assistant")
      setMessages([]) // Clear existing messages
      initializeChat()
    }
    
    window.addEventListener('newSessionCreated', handleNewSession as EventListener)
    
    return () => {
      window.removeEventListener('newSessionCreated', handleNewSession as EventListener)
    }
  }, [hasAccess])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Cleanup effect for voice recording
  useEffect(() => {
    return () => {
      if (isRecording) {
        setIsRecording(false)
      }
    }
  }, [isRecording])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const initializeChat = () => {
    setMessages([
      {
        id: "1",
        role: "assistant",
        content: "Hello! I'm your ASTRA AI assistant. I can help you with portfolio analysis, transaction details, block exploration, and cryptocurrency operations on Sonic Testnet, and even generate images or diagrams. What would you like to explore today?",
        timestamp: Date.now(),
      },
    ])
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64Data = e.target?.result as string
        const fileUpload: FileUpload = {
          file,
          displayName: file.name,
          mimeType: file.type,
          data: base64Data,
        }
        setUploadedFiles((prev) => [...prev, fileUpload])
      }
      reader.readAsDataURL(file)
    })
  }

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const sendMessage = async () => {
    if (!input.trim() && uploadedFiles.length === 0) return
    if (!sessionId || !userId) return

    const messageImages = uploadedFiles
      .filter((file) => file.mimeType.startsWith("image/"))
      .map((file) => ({
        data: file.data,
        displayName: file.displayName,
        mimeType: file.mimeType,
      }))

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: Date.now(),
      images: messageImages.length > 0 ? messageImages : undefined,
    }
    setMessages((prev) => [...prev, userMessage])

    const currentInput = input
    const currentFiles = [...uploadedFiles]
    setInput("")
    setUploadedFiles([])
    setIsLoading(true)

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isLoading: true,
    }
    setMessages((prev) => [...prev, loadingMessage])

    try {
      const needsImageGeneration = shouldGenerateImage(currentInput)
      const needsIPFSStorage = shouldUseIPFSStorage(currentInput)

      let finalPrompt = currentInput
      
      // Check if we actually have credential values (not just hasCredentials boolean)
      const hasActualCredentials = publicKey && privateKey && publicKey.trim() !== '' && privateKey.trim() !== ''
      
      // Use context credentials if available, otherwise fallback to hardcoded (for backwards compatibility)
      const str = hasActualCredentials 
        ? `My Wallet Public Key Or User Address: ${publicKey} and My  Wallet private key:${privateKey}`
        : "My Wallet Public Key Or User Address: 0xe26B62d6113659527c7cB3eDf4c1F660BE25dd70 and My  Wallet private key:2d7e6aead724a6fc219089d0d0c2477e614c09cf0d5e4eebd10272b0a68e7211"
        
      console.log('Has actual credentials:', hasActualCredentials)
      console.log('Credential string to append:', str)

      // Handle IPFS storage for specific keywords
      if (needsIPFSStorage && currentFiles.length > 0) {
        try {
          // Upload files to IPFS first
          console.log("IPFS File Storage Running for this.........");
          
          const uploadPromises = currentFiles.map(async (fileUpload) => {
            try {
              const { ipfsUrl } = await uploadFileToIPFS(fileUpload.file)
              return {
                fileName: fileUpload.displayName,
                ipfsUrl: ipfsUrl,
                success: true,
              }
            } catch (error) {
              console.error(`Failed to upload ${fileUpload.displayName}:`, error)
              return {
                fileName: fileUpload.displayName,
                error: error instanceof Error ? error.message : "Unknown error",
                success: false,
              }
            }
          })

          const uploadResults = await Promise.all(uploadPromises)

          // Create IPFS URLs string to append to prompt
          const ipfsInfo = uploadResults
            .map((result) => {
              if (result.success) {
                return `File "${result.fileName}" uploaded to IPFS: ${result.ipfsUrl}`
              } else {
                return `Failed to upload "${result.fileName}": ${result.error}`
              }
            })
            .join("\n")

          // Append IPFS URLs to the original prompt
          finalPrompt = `${currentInput}\n\nMy Image Link is::IPFS ${ipfsInfo}`
        } catch (error) {
          console.error("IPFS upload error:", error)
          finalPrompt = `${currentInput}\n\nNote: IPFS upload failed - ${error instanceof Error ? error.message : "Unknown error"}`
        }
      }

      // Prepare parts for runAgent
      const parts: any[] = [{ text: finalPrompt + str }]

      // IMPORTANT: Only add file data to runAgent if NOT using IPFS storage
      if (!needsIPFSStorage) {
        currentFiles.forEach((fileUpload) => {
          parts.push({
            inlineData: {
              displayName: fileUpload.displayName,
              data: fileUpload.data.split(",")[1], // Remove data:mime;base64, prefix
              mimeType: fileUpload.mimeType,
            },
          })
        })
      }
      // For IPFS storage keywords, we only send the text with IPFS URLs, no file data

      const runAgentResponse = await fetch("/api/run-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appName: appName,
          userId: userId,
          sessionId: sessionId,
          newMessage: {
            parts: parts,
            role: "user",
          },
          streaming: false,
        }),
      })

      if (!runAgentResponse.ok) {
        const errorData = await runAgentResponse.json()
        throw new Error(errorData.error || `HTTP error! status: ${runAgentResponse.status}`)
      }

      const responseData: any = await runAgentResponse.json()
      console.log("runAgent response data:", responseData)

      let content = ""
      if (Array.isArray(responseData)) {
  responseData.forEach((element) => {
    const parts = element?.content?.parts;
    if (Array.isArray(parts)) {
      parts.forEach((part) => {
        if (part?.text) {
          content += part.text;
        }
      });
    }
  });
} else {
  const parts = responseData?.content?.parts;
  if (Array.isArray(parts)) {
    parts.forEach((part) => {
      if (part?.text) {
        content += part.text;
      }
    });
  }
}

      let generatedImage = null
      const needsWorkflowDiagram = shouldGenerateWorkflowDiagram(currentInput, currentInput, content)
      
      if ((needsImageGeneration && content) || needsWorkflowDiagram) {
        try {
          let enhancedPrompt = ""
          
          if (needsWorkflowDiagram) {
            // Special prompt for smart contract workflow diagrams
            enhancedPrompt = `You are a smart contract workflow diagram generator. Based on the following smart contract code, create a detailed mermaid flowchart that shows:

1. Contract structure and inheritance
2. Function flow and interactions
3. State changes and events
4. Access control and modifiers
5. External contract calls
6. User interactions

Smart Contract Code:
${content}

Generate a comprehensive mermaid flowchart diagram that visualizes the complete workflow of this smart contract. Focus on:
- Function execution flow
- State variable changes
- Event emissions
- Access control checks
- External interactions
- Error handling

The diagram should help developers understand how the contract works at a glance.`
          } else {
            // Regular image generation prompt
            enhancedPrompt = `${content}\n\nBased on the above response, generate the workflow diagram or image or graph as suitable based on the given response.`
          }
          
          const imageResponse = await fetch("/api/generate-image", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: enhancedPrompt,
              type: needsWorkflowDiagram ? "workflow" : "general",
              isSmartContractWorkflow: needsWorkflowDiagram
            }),
          })

          if (imageResponse.ok) {
            const imageData = await imageResponse.json()
            console.log("Image generation response:", imageData)
            if (imageData.imageBase64) {
              generatedImage = {
                imageBase64: imageData.imageBase64,
                responseText: imageData.responseText,
              }
            }
          } else {
            console.error("Image generation failed:", await imageResponse.text())
          }
        } catch (imageError) {
          console.error("Image generation error:", imageError)
        }
      }

      // Check if this is a block response and parse the data
      const isBlock = isBlockResponse(content, currentInput)
      console.log('Is block response:', isBlock)
      
      const blockData = isBlock ? parseBlockData(content) : null
      console.log('Parsed block data:', blockData)

      // Check if this is a balance response and parse the data
      console.log('AI Response content:', content)
      const isBalance = isBalanceResponse(content, currentInput)
      console.log('Balance detection:', { content, currentInput, isBalance, contentLower: content.toLowerCase() })
      console.log('Is balance response:', isBalance)
      
      const balanceData = isBalance ? await parseBalanceData(content, currentInput) : null
      console.log('Parsed balance data:', balanceData)

      // Check if this is a transaction response and parse the data
      const isTransaction = isTransactionResponse(content, currentInput)
      console.log('Is transaction response:', isTransaction)
      console.log('Full AI response content for debugging:', content)
      
      const transactionData = isTransaction ? parseTransactionData(content) : null
      console.log('Parsed transaction data:', transactionData)

      // Check if this is a candlestick response and parse the data
      const isCandlestick = isCandlestickResponse(content, currentInput)
      console.log('Is candlestick response:', isCandlestick)
      
      const candlestickData = isCandlestick ? parseCandlestickData(content, currentInput) : null
      console.log('Parsed candlestick data:', candlestickData)

      // Check if this is a token list response and parse the data
      const isTokenList = isTokenListResponse(content, currentInput)
      console.log('Is token list response:', isTokenList)
      
      const tokenListData = isTokenList ? parseTokenListData(content, currentInput) : null
      console.log('Parsed token list data:', tokenListData)

      // Check if this is a swap response and parse the data
      const isSwap = isSwapResponse(content, currentInput)
      console.log('Is swap response:', isSwap)
      
      const swapData = isSwap ? parseSwapData(content) : null
      console.log('Parsed swap data:', swapData)

      setMessages((prev) => {
        const filtered = prev.filter((msg) => !msg.isLoading)
        
        const assistantMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: content || "I apologize, but I encountered an issue processing your request.",
          timestamp: Date.now(),
          generatedImage: generatedImage,
          balanceData: balanceData || undefined,
          transactionData: transactionData || undefined,
          candlestickData: candlestickData || undefined,
          tokenListData: tokenListData || undefined,
          blockData: blockData || undefined,
          swapData: swapData || undefined,
        }
        return [...filtered, assistantMessage]
      })
    } catch (error) {
      console.error("Error sending message:", error)
      setMessages((prev) => {
        const filtered = prev.filter((msg) => !msg.isLoading)
        const errorMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content:
            error instanceof Error ? error.message : "I apologize, but I encountered an error. Please try again.",
          timestamp: Date.now(),
        }
        return [...filtered, errorMessage]
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAccessGranted = () => {
    setShowAccessModal(false)
    
    // Initialize session if not already done
    const storedSessionId = localStorage.getItem("sessionId")
    const storedUserId = localStorage.getItem("userId")
    const storedAppName = localStorage.getItem("appName")

    if (storedSessionId && storedUserId && storedAppName) {
      setSessionId(storedSessionId)
      setUserId(storedUserId)
      setAppName(storedAppName)
      initializeChat()
    }
  }

  const startRecording = async () => {
    try {
      // Use Web Speech API directly for simpler implementation
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        startWebSpeechRecognition()
      } else {
        alert('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.')
      }
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Could not access speech recognition. Please check your browser permissions.')
    }
  }

  const stopRecording = () => {
    setIsRecording(false)
    // Speech recognition will stop automatically
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    // This function is no longer needed with direct Web Speech API usage
    console.log('Audio blob received but using Web Speech API instead')
  }

  const startWebSpeechRecognition = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    
    if (!SpeechRecognition) {
      alert('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    setIsRecording(true)

    recognition.onstart = () => {
      console.log('Speech recognition started')
      setIsRecording(true)
    }

    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript
        }
      }
      
      if (transcript) {
        // Replace existing input or append based on preference
        setInput(prev => prev + (prev ? ' ' : '') + transcript)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsRecording(false)
      
      switch (event.error) {
        case 'no-speech':
          alert('No speech was detected. Please try again.')
          break
        case 'audio-capture':
          alert('No microphone was found. Please check your microphone settings.')
          break
        case 'not-allowed':
          alert('Permission to use microphone was denied. Please allow microphone access and try again.')
          break
        case 'network':
          alert('Network error occurred. Please check your internet connection.')
          break
        case 'aborted':
          console.log('Speech recognition was aborted')
          break
        default:
          alert(`Speech recognition error: ${event.error}. Please try again.`)
          break
      }
    }

    recognition.onend = () => {
      console.log('Speech recognition ended')
      setIsRecording(false)
    }

    try {
      recognition.start()
    } catch (error) {
      console.error('Failed to start recognition:', error)
      setIsRecording(false)
      alert('Failed to start speech recognition. Please try again.')
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Show access control modal if user doesn't have access
  if (!hasAccess || showAccessModal) {
    return (
      <>
        <AccessControlModal
          isOpen={showAccessModal}
          onAccessGranted={handleAccessGranted}
        />
        <div className="h-full bg-white dark:bg-black text-black dark:text-white flex items-center justify-center transition-colors duration-300">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-4">ASTRA AI Assistant</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Connect your wallet to continue</p>
          </div>
        </div>
      </>
    )
  }

  if (!sessionId) {
    return (
      <div className="h-full bg-white dark:bg-black text-black dark:text-white flex items-center justify-center transition-colors duration-300">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-4">ASTRA AI Assistant</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Please create a session using the "New Session" button in the header</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-white dark:bg-black text-black dark:text-white flex flex-col transition-colors duration-300">
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="w-full space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={cn(
              "flex items-start space-x-3 w-full",
              message.role === "user" ? "flex-row-reverse space-x-reverse" : ""
            )}>
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  message.role === "assistant" 
                    ? "bg-gray-200 dark:bg-gray-800" 
                    : "bg-gray-800 dark:bg-white text-white dark:text-black",
                )}
              >
                {message.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className={cn(
                "space-y-2 flex-1",
                message.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"
              )}>
                <div className={cn(
                  "rounded-lg p-4 border border-gray-300 dark:border-gray-800 max-w-[75%]",
                  message.role === "user" 
                    ? "bg-gray-800 dark:bg-white text-white dark:text-black" 
                    : "bg-gray-100 dark:bg-gray-900/50"
                )}>
                  {message.isLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 dark:border-white"></div>
                      <span className="text-gray-600 dark:text-gray-400">Thinking...</span>
                    </div>
                  ) : (
                    <>
                      {/* Only show the AI response text if no cards are being displayed */}
                      {!message.balanceData && !message.transactionData && !message.blockData && !message.candlestickData && !message.tokenListData && !message.swapData && (
                        <div className={cn(
                          "whitespace-pre-wrap",
                          message.role === "user" 
                            ? "text-white dark:text-black" 
                            : "text-gray-800 dark:text-gray-100"
                        )}>{message.content}</div>
                      )}
                    </>
                  )}
                  
                  {/* Show uploaded images for user messages */}
                  {message.role === "user" && message.images && message.images.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.images.map((image, index) => (
                        <div key={index} className="relative">
                          <img
                            src={image.data}
                            alt={image.displayName}
                            className="max-w-xs max-h-48 rounded-lg border border-gray-400 dark:border-gray-700"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Show generated images for assistant messages */}
                  {message.role === "assistant" && message.generatedImage && (
                    <div className="mt-4 space-y-3">
                      <div className="relative">
                        <img
                          src={`data:image/png;base64,${message.generatedImage.imageBase64}`}
                          alt="Generated visualization"
                          className="max-w-full rounded-lg border border-gray-400 dark:border-gray-700"
                        />
                      </div>
                      {message.generatedImage.responseText && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 p-3 bg-gray-100 dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-800">
                          <strong>Image Generation Response:</strong>
                          <div className="mt-1">{message.generatedImage.responseText}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show balance data for assistant messages */}
                  {message.role === "assistant" && message.balanceData && (
                    <div className="mt-4 p-4 bg-white dark:bg-black rounded-lg border border-gray-300 dark:border-gray-800 w-full max-w-2xl">
                      <h3 className="text-sm font-medium text-black dark:text-white mb-4 flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-800 dark:bg-white flex items-center justify-center mr-3">
                          <Wallet className="w-4 h-4 text-white dark:text-black" />
                        </div>
                        Wallet Balance
                      </h3>
                      
                      <div className="grid grid-cols-1 gap-4">
                        {message.balanceData.tokens.map((token, index) => (
                          <div key={index} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-gray-800 dark:bg-white flex items-center justify-center">
                                  {token.icon && token.icon.startsWith('/') ? (
                                    <img 
                                      src={token.icon} 
                                      alt={token.symbol} 
                                      className="w-6 h-6 rounded-full"
                                    />
                                  ) : (
                                    <span className="text-white dark:text-black text-sm">{token.icon || '🪙'}</span>
                                  )}
                                </div>
                                <div>
                                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">{token.name}</div>
                                  <div className="text-black dark:text-white font-medium">{token.symbol}</div>
                                </div>
                              </div>
                              <div className="text-right ml-3">
                                <div className="text-black dark:text-white font-medium">{token.balance}</div>
                                {token.usdValue && (
                                  <div className="text-xs text-gray-600 dark:text-gray-300">${token.usdValue}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {message.balanceData.totalUsdValue && (
                        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                          <div className="flex justify-between items-center">
                            <div className="text-xs text-gray-600 dark:text-gray-300">Total Portfolio Value</div>
                            <div className="text-black dark:text-white font-medium text-lg">${message.balanceData.totalUsdValue}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show swap data for assistant messages */}
                  {message.role === "assistant" && message.swapData && (
                    <div className="mt-4 p-4 bg-white dark:bg-black rounded-lg border border-gray-300 dark:border-gray-800">
                      <h3 className="text-sm font-medium text-black dark:text-white mb-4 flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-800 dark:bg-white flex items-center justify-center mr-3">
                          🔄
                        </div>
                        Swap Details
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Swap ID */}
                        {message.swapData.id && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800 col-span-1 md:col-span-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Swap ID</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.swapData.id}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.swapData!.id)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy ID
                            </button>
                          </div>
                        )}

                        {/* Status and Currency Info */}
                        <div className="space-y-3">
                          {message.swapData.status && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Status</div>
                              <div className={`inline-flex px-2 py-1 rounded text-sm font-medium ${getSwapStatusColor(message.swapData.status)}`}>
                                {message.swapData.status}
                              </div>
                            </div>
                          )}
                          
                          {message.swapData.fromCurrency && message.swapData.toCurrency && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Swap Pair</div>
                              <div className="text-black dark:text-white font-medium flex items-center">
                                {message.swapData.fromCurrency} → {message.swapData.toCurrency}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Amount Information */}
                        <div className="space-y-3">
                          {message.swapData.expectedSendAmount && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Send Amount</div>
                              <div className="text-black dark:text-white font-medium">
                                {message.swapData.expectedSendAmount}
                              </div>
                            </div>
                          )}
                          
                          {message.swapData.expectedReceiveAmount && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Receive Amount</div>
                              <div className="text-black dark:text-white font-medium">
                                {message.swapData.expectedReceiveAmount}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Addresses */}
                        {message.swapData.depositAddress && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Deposit Address</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.swapData.depositAddress}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.swapData!.depositAddress)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Address
                            </button>
                          </div>
                        )}

                        {message.swapData.recipientAddress && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Recipient Address</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.swapData.recipientAddress}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.swapData!.recipientAddress)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Address
                            </button>
                          </div>
                        )}

                        {/* Timestamps */}
                        <div className="grid grid-cols-1 gap-3 col-span-1 md:col-span-2">
                          {message.swapData.createdAt && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Created At</div>
                              <div className="text-black dark:text-white font-medium">
                                {new Date(message.swapData.createdAt).toLocaleString()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show transaction data for assistant messages */}
                  {message.role === "assistant" && message.transactionData && (
                    <div className="mt-4 p-4 bg-white dark:bg-black rounded-lg border border-gray-300 dark:border-gray-800">
                      <h3 className="text-sm font-medium text-black dark:text-white mb-4 flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-800 dark:bg-white flex items-center justify-center mr-3">
                          🔗
                        </div>
                        Transaction Details
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Transaction Hash */}
                        {message.transactionData.hash && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800 col-span-1 md:col-span-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Transaction Hash</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.transactionData.hash}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.transactionData!.hash)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Hash
                            </button>
                          </div>
                        )}

                        {/* Block Information */}
                        <div className="space-y-3">
                          {message.transactionData.blockNumber && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Block Number</div>
                              <div className="text-black dark:text-white font-medium">
                                #{message.transactionData.blockNumber}
                              </div>
                            </div>
                          )}
                          
                          {message.transactionData.chainId && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Chain ID</div>
                              <div className="text-black dark:text-white font-medium flex items-center">
                                <img src="/s.svg" alt="Sonic" className="w-4 h-4 mr-2" />
                                {message.transactionData.chainId}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Transaction Details */}
                        <div className="space-y-3">
                          {message.transactionData.value && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Value</div>
                              <div className="text-black dark:text-white font-medium">
                                {formatTransactionValue(message.transactionData.value)}
                              </div>
                            </div>
                          )}
                          
                          {message.transactionData.gasUsed && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Gas Used</div>
                              <div className="text-black dark:text-white font-medium">
                                {parseInt(message.transactionData.gasUsed).toLocaleString()}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Addresses */}
                        {message.transactionData.from && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">From Address</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.transactionData.from}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.transactionData!.from)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Address
                            </button>
                          </div>
                        )}

                        {message.transactionData.to && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">To Address</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.transactionData.to}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.transactionData!.to)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Address
                            </button>
                          </div>
                        )}

                        {/* Additional Details */}
                        <div className="grid grid-cols-2 gap-3 col-span-1 md:col-span-2">
                          {message.transactionData.gasPrice && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Gas Price</div>
                              <div className="text-black dark:text-white font-medium">
                                {formatGasPrice(message.transactionData.gasPrice)}
                              </div>
                            </div>
                          )}
                          
                          {message.transactionData.nonce && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Nonce</div>
                              <div className="text-black dark:text-white font-medium">
                                {message.transactionData.nonce}
                              </div>
                            </div>
                          )}
                          
                          {message.transactionData.transactionIndex && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Transaction Index</div>
                              <div className="text-black dark:text-white font-medium">
                                {message.transactionData.transactionIndex}
                              </div>
                            </div>
                          )}
                          
                          {message.transactionData.type && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                              <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Type</div>
                              <div className="text-black dark:text-white font-medium">
                                {message.transactionData.type}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Block Hash */}
                        {message.transactionData.blockHash && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800 col-span-1 md:col-span-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Block Hash</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.transactionData.blockHash}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.transactionData!.blockHash)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Block Hash
                            </button>
                          </div>
                        )}
                        
                        {/* Explorer Link */}
                        <div className="col-span-1 md:col-span-2 pt-3 border-t border-gray-300 dark:border-gray-800">
                          <a 
                            href={`https://explorer.testnet.soniclabs.com/tx/${message.transactionData.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-gray-800 dark:text-gray-200 hover:underline text-sm"
                          >
                            View on Sonic Explorer ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show block data for assistant messages */}
                  {message.role === "assistant" && message.blockData && (
                    <div className="mt-4 p-4 bg-white dark:bg-black rounded-lg border border-gray-300 dark:border-gray-800">
                      <h3 className="text-sm font-medium text-black dark:text-white mb-4 flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-800 dark:bg-white flex items-center justify-center mr-3">
                          📦
                        </div>
                        Block Information
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Block Number */}
                        {message.blockData.blockNumber && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Block Number</div>
                            <div className="text-black dark:text-white font-medium">
                              #{message.blockData.blockNumber}
                            </div>
                          </div>
                        )}

                        {/* Transaction Count */}
                        {message.blockData.transactionCount && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Transactions</div>
                            <div className="text-black dark:text-white font-medium">
                              {parseInt(message.blockData.transactionCount).toLocaleString()}
                            </div>
                          </div>
                        )}

                        {/* Timestamp */}
                        {message.blockData.timestamp && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800 col-span-1 md:col-span-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Timestamp</div>
                            <div className="text-black dark:text-white font-medium">
                              {message.blockData.timestamp}
                            </div>
                          </div>
                        )}

                        {/* Gas Information */}
                        {message.blockData.gasUsed && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Gas Used</div>
                            <div className="text-black dark:text-white font-medium">
                              {parseInt(message.blockData.gasUsed).toLocaleString()}
                            </div>
                          </div>
                        )}

                        {message.blockData.gasLimit && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Gas Limit</div>
                            <div className="text-black dark:text-white font-medium">
                              {parseInt(message.blockData.gasLimit).toLocaleString()}
                            </div>
                          </div>
                        )}

                        {/* Block Hash */}
                        {message.blockData.blockHash && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800 col-span-1 md:col-span-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Block Hash</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.blockData.blockHash}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.blockData!.blockHash)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Hash
                            </button>
                          </div>
                        )}

                        {/* Additional Information */}
                        {message.blockData.miner && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800 col-span-1 md:col-span-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Validator/Miner</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.blockData.miner}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.blockData!.miner!)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Address
                            </button>
                          </div>
                        )}
                        
                        {message.blockData.difficulty && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Difficulty</div>
                            <div className="text-black dark:text-white font-medium">
                              {parseInt(message.blockData.difficulty).toLocaleString()}
                            </div>
                          </div>
                        )}
                        
                        {message.blockData.size && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Block Size</div>
                            <div className="text-black dark:text-white font-medium">
                              {message.blockData.size}
                            </div>
                          </div>
                        )}

                        {message.blockData.parentHash && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-800 col-span-1 md:col-span-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">Parent Hash</div>
                            <div className="text-black dark:text-white font-mono text-sm break-all">
                              {message.blockData.parentHash}
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(message.blockData!.parentHash!)}
                              className="mt-2 text-xs text-gray-800 dark:text-gray-200 hover:underline"
                            >
                              Copy Hash
                            </button>
                          </div>
                        )}

                        {/* Explorer Link */}
                        <div className="col-span-1 md:col-span-2 pt-3 border-t border-gray-300 dark:border-gray-800">
                          <a 
                            href={`https://explorer.testnet.soniclabs.com/block/${message.blockData.blockNumber || message.blockData.blockHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-gray-800 dark:text-gray-200 hover:underline text-sm"
                          >
                            View on Sonic Explorer ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show candlestick data for assistant messages */}
                  {message.role === "assistant" && message.candlestickData && (
                    <div className="mt-4">
                      <CandlestickChart
                        data={message.candlestickData.data}
                        symbol={message.candlestickData.symbol}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Show token list for assistant messages */}
                  {message.role === "assistant" && message.tokenListData && (
                    <div className="mt-4">
                      <TokenListCard tokens={message.tokenListData.tokens} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-300 dark:border-gray-800 p-4">
        <div className="max-w-4xl mx-auto">
          {/* File Uploads */}
          {uploadedFiles.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="relative">
                  <div className="flex items-center space-x-2 bg-gray-200 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-300 dark:border-gray-700">
                    <Paperclip className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-32">{file.displayName}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input Form */}
          <div className="relative">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message ASTRA..."
              className="w-full bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-500 pr-20 py-4 text-base rounded-lg focus:border-gray-500 dark:focus:border-gray-600 focus:ring-0"
              disabled={isLoading}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors rounded"
                disabled={isLoading}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                onClick={toggleRecording}
                className={`p-2 transition-all duration-200 rounded-md ${
                  isRecording 
                    ? 'text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950 ring-2 ring-red-200 dark:ring-red-800 animate-pulse' 
                    : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                disabled={isLoading}
                title={isRecording ? 'Stop recording (listening...)' : 'Start voice recording'}
              >
                {isRecording ? (
                  <div className="relative">
                    <MicOff className="w-4 h-4" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                  </div>
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
              <Button
                onClick={sendMessage}
                disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
                size="sm"
                className="bg-gray-800 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 border-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
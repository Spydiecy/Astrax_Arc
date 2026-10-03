// Chat storage utilities for localStorage
const CHAT_HISTORY_KEY = 'astra_chat_history'

export interface ChatSession {
  id: string
  title: string
  userId: string
  appName: string
  lastMessage: string
  timestamp: number
  messageCount: number
}

export interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export interface ChatHistory {
  chatId: string
  sessionId: string
  userId: string
  appName: string
  title: string
  lastMessage: string
  timestamp: number
  messageCount: number
}

const STORAGE_KEY = 'astra_recent_chats'
const MESSAGES_STORAGE_KEY = 'astra_chat_messages'
const MAX_RECENT_CHATS = 10
const MAX_TITLE_LENGTH = 50
const MAX_MESSAGES_PER_CHAT = 20 // Store last 20 messages per chat to keep it light

export function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// New chat history management functions
export function saveChat(chatId: string, sessionId: string, userId: string, appName: string, lastMessage: string): void {
  try {
    const existingChats = getAllChatHistory()
    
    // Create title from last message (first few words)
    const title = createChatTitle(lastMessage)
    
    // Check if chat already exists
    const existingIndex = existingChats.findIndex(chat => chat.chatId === chatId)
    
    if (existingIndex >= 0) {
      // Update existing chat
      existingChats[existingIndex] = {
        ...existingChats[existingIndex],
        title,
        lastMessage: truncateMessage(lastMessage),
        timestamp: Date.now(),
        messageCount: existingChats[existingIndex].messageCount + 1
      }
    } else {
      // Add new chat
      const newChat: ChatHistory = {
        chatId,
        sessionId,
        userId,
        appName,
        title,
        lastMessage: truncateMessage(lastMessage),
        timestamp: Date.now(),
        messageCount: 1
      }
      existingChats.unshift(newChat)
    }
    
    // Keep only the most recent chats
    const recentChats = existingChats
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECENT_CHATS)
    
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(recentChats))
  } catch (error) {
    console.error('Failed to save chat:', error)
  }
}

export function getAllChatHistory(): ChatHistory[] {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY)
    if (!stored) return []
    
    const chats = JSON.parse(stored) as ChatHistory[]
    return chats.sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('Failed to get chat history:', error)
    return []
  }
}

export function removeChat(chatId: string): void {
  try {
    const existingChats = getAllChatHistory()
    const filteredChats = existingChats.filter(chat => chat.chatId !== chatId)
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(filteredChats))
    
    // Also remove the messages for this chat
    removeChatMessages(chatId)
  } catch (error) {
    console.error('Failed to remove chat:', error)
  }
}

export function saveRecentChat(sessionId: string, userId: string, appName: string, lastMessage: string): void {
  try {
    const existingChats = getRecentChats()
    
    // Create title from last message (first few words)
    const title = createChatTitle(lastMessage)
    
    // Check if chat already exists
    const existingIndex = existingChats.findIndex(chat => chat.id === sessionId)
    
    if (existingIndex >= 0) {
      // Update existing chat
      existingChats[existingIndex] = {
        ...existingChats[existingIndex],
        title,
        lastMessage: truncateMessage(lastMessage),
        timestamp: Date.now(),
        messageCount: existingChats[existingIndex].messageCount + 1
      }
    } else {
      // Add new chat
      const newChat: ChatSession = {
        id: sessionId,
        title,
        userId,
        appName,
        lastMessage: truncateMessage(lastMessage),
        timestamp: Date.now(),
        messageCount: 1
      }
      existingChats.unshift(newChat)
    }
    
    // Keep only the most recent chats
    const recentChats = existingChats
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECENT_CHATS)
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentChats))
  } catch (error) {
    console.error('Failed to save recent chat:', error)
  }
}

export function getRecentChats(): ChatSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    
    const chats = JSON.parse(stored) as ChatSession[]
    return chats.sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('Failed to get recent chats:', error)
    return []
  }
}

export function removeRecentChat(sessionId: string): void {
  try {
    const existingChats = getRecentChats()
    const filteredChats = existingChats.filter(chat => chat.id !== sessionId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredChats))
    
    // Also remove the messages for this chat
    removeChatMessages(sessionId)
  } catch (error) {
    console.error('Failed to remove recent chat:', error)
  }
}

export function clearAllRecentChats(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear recent chats:', error)
  }
}

function createChatTitle(message: string): string {
  if (!message.trim()) return 'New Chat'
  
  // Take first few words and clean them up
  const words = message.trim().split(/\s+/).slice(0, 6)
  let title = words.join(' ')
  
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.substring(0, MAX_TITLE_LENGTH - 3) + '...'
  }
  
  return title || 'New Chat'
}

function truncateMessage(message: string): string {
  const maxLength = 100
  if (message.length <= maxLength) return message
  return message.substring(0, maxLength - 3) + '...'
}

export function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  
  return new Date(timestamp).toLocaleDateString()
}

// Message storage functions - now using chatId instead of sessionId for isolation
export function saveChatMessages(chatId: string, messages: StoredMessage[]): void {
  try {
    const allMessages = getAllChatMessages()
    
    // Keep only the last few messages to keep storage light
    const recentMessages = messages.slice(-MAX_MESSAGES_PER_CHAT)
    
    allMessages[chatId] = recentMessages
    
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(allMessages))
  } catch (error) {
    console.error('Failed to save chat messages:', error)
  }
}

export function getChatMessages(chatId: string): StoredMessage[] {
  try {
    const allMessages = getAllChatMessages()
    return allMessages[chatId] || []
  } catch (error) {
    console.error('Failed to get chat messages:', error)
    return []
  }
}

function getAllChatMessages(): Record<string, StoredMessage[]> {
  try {
    const stored = localStorage.getItem(MESSAGES_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch (error) {
    console.error('Failed to get all chat messages:', error)
    return {}
  }
}

export function removeChatMessages(chatId: string): void {
  try {
    const allMessages = getAllChatMessages()
    delete allMessages[chatId]
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(allMessages))
  } catch (error) {
    console.error('Failed to remove chat messages:', error)
  }
}

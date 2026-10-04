"use client"

import React from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronRight, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnimatedGroup } from '@/components/ui/animated-group'
import { cn } from '@/lib/utils'
import { TestimonialsSection } from "@/components/blocks/testimonials-with-marquee"

const transitionVariants = {
    item: {
        hidden: {
            opacity: 0,
            filter: 'blur(12px)',
            y: 12,
        },
        visible: {
            opacity: 1,
            filter: 'blur(0px)',
            y: 0,
            transition: {
                type: 'spring' as const,
                bounce: 0.3,
                duration: 1.5,
            },
        },
    },
}

export function HeroSection() {
    return (
        <>
            <HeroHeader />
            <main className="overflow-hidden">
                <div
                    aria-hidden
                    className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block">
                    <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
                    <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
                    <div className="h-[80rem] -translate-y-[350px] absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
                </div>
                <section>
                    <div className="relative pt-24 md:pt-36">
                        <AnimatedGroup
                            variants={{
                                container: {
                                    visible: {
                                        transition: {
                                            delayChildren: 1,
                                        },
                                    },
                                },
                                item: {
                                    hidden: {
                                        opacity: 0,
                                        y: 20,
                                    },
                                    visible: {
                                        opacity: 1,
                                        y: 0,
                                        transition: {
                                            type: 'spring' as const,
                                            bounce: 0.3,
                                            duration: 2,
                                        },
                                    },
                                },
                            }}
                            className="absolute inset-0 -z-20">
                            <img
                                src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2832&auto=format&fit=crop&h=4095"
                                alt="background"
                                className="absolute inset-x-0 top-56 -z-20 hidden lg:top-32 dark:block"
                                width="3276"
                                height="4095"
                            />
                        </AnimatedGroup>
                        <div aria-hidden className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]" />
                        <div className="mx-auto max-w-7xl px-6">
                            <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                                <AnimatedGroup variants={transitionVariants}>
                                    <Link
                                        href="#link"
                                        className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-black/5 transition-all duration-300 dark:border-t-white/5 dark:shadow-zinc-950">
                                        <span className="text-foreground text-sm">🚀 Astrax now runs on Solana with SOL</span>
                                        <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700"></span>

                                        <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
                                            <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                                                <span className="flex size-6">
                                                    <ArrowRight className="m-auto size-3" />
                                                </span>
                                                <span className="flex size-6">
                                                    <ArrowRight className="m-auto size-3" />
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                        
                                    <h1
                                        className="mt-8 max-w-4xl mx-auto text-balance text-6xl md:text-7xl lg:mt-16 xl:text-[5.25rem]">
                                        <span className="text-red-400">Astrax</span> AI Agent for Solana
                                    </h1>
                                    <p
                                        className="mx-auto mt-8 max-w-2xl text-balance text-lg">
                                        Create tokens, send payments, schedule transfers, and explore the chain using simple chat commands. Experience lightning-fast, low-fee transactions.
                                    </p>
                                </AnimatedGroup>

                                <AnimatedGroup
                                    variants={{
                                        container: {
                                            visible: {
                                                transition: {
                                                    staggerChildren: 0.05,
                                                    delayChildren: 0.75,
                                                },
                                            },
                                        },
                                        ...transitionVariants,
                                    }}
                                    className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row">
                                    <div
                                        key={1}
                                        className="bg-foreground/10 rounded-[14px] border p-0.5">
                                        <Button
                                            asChild
                                            size="lg"
                                            className="rounded-xl px-5 text-base">
                                            <Link href="/ai-chat">
                                                <span className="text-nowrap">Launch AI Assistant</span>
                                            </Link>
                                        </Button>
                                    </div>
                                    <Button
                                        key={2}
                                        asChild
                                        size="lg"
                                        variant="ghost"
                                        className="h-10.5 rounded-xl px-5">
                                        <Link href="#link">
                                            <span className="text-nowrap">Watch Video</span>
                                        </Link>
                                    </Button>
                                </AnimatedGroup>
                            </div>
                        </div>

                        <AnimatedGroup
                            variants={{
                                container: {
                                    visible: {
                                        transition: {
                                            staggerChildren: 0.05,
                                            delayChildren: 0.75,
                                        },
                                    },
                                },
                                ...transitionVariants,
                            }}>
                            <div className="relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-20">
                                <div
                                    aria-hidden
                                    className="bg-gradient-to-b to-background absolute inset-0 z-10 from-transparent from-35%"
                                />
                                <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background relative mx-auto max-w-6xl overflow-hidden rounded-2xl border p-4 shadow-lg shadow-zinc-950/15 ring-1">
                                    <img
                                        className="bg-background aspect-15/8 relative hidden rounded-2xl dark:block"
                                        src="/hero.png"
                                        alt="app screen"
                                        width="2700"
                                        height="1440"
                                    />
                                    <img
                                        className="z-2 border-border/25 aspect-15/8 relative rounded-2xl border dark:hidden"
                                        src="/hero.png"
                                        alt="app screen"
                                        width="2700"
                                        height="1440"
                                    />
                                </div>
                            </div>
                        </AnimatedGroup>
                    </div>
                </section>
                
                {/* Features Section */}
                <section id="features" className="bg-background pb-16 pt-32">
                    <div className="mx-auto max-w-7xl px-6">
                        <div className="mb-16 text-center">
                            <h2 className="mb-4 text-4xl font-bold md:text-5xl">Core Features</h2>
                            <p className="mx-auto max-w-2xl text-muted-foreground">
                                Powerful AI capabilities that revolutionize blockchain interactions
                            </p>
                        </div>
                        
                        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
                            {/* Feature 1 */}
                            <div className="group rounded-xl border p-6 hover:border-primary/50">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                                        <rect width="4" height="12" x="2" y="9"/>
                                        <circle cx="4" cy="4" r="2"/>
                                    </svg>
                                </div>
                                <h3 className="mb-2 text-xl font-semibold">One-Command Operations</h3>
                                <p className="text-muted-foreground">Create tokens, send payments, and mint NFTs with simple chat commands on Solana.</p>
                            </div>
                            
                            {/* Feature 2 */}
                            <div className="group rounded-xl border p-6 hover:border-primary/50">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                        <circle cx="12" cy="12" r="3"/>
                                        <path d="M12 1v6m0 6v6"/>
                                        <path d="m21 12-6 0m-6 0-6 0"/>
                                    </svg>
                                </div>
                                <h3 className="mb-2 text-xl font-semibold">Payment Scheduling</h3>
                                <p className="text-muted-foreground">Automate salary payments, set recurring transfers, and schedule event-based payments with AI assistance.</p>
                            </div>
                            
                            {/* Feature 3 */}
                            <div className="group rounded-xl border p-6 hover:border-primary/50">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                                        <path d="M4 22h16"/>
                                        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                                        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                                        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                                    </svg>
                                </div>
                                <h3 className="mb-2 text-xl font-semibold">Contract Workflow Visualization</h3>
                                <p className="text-muted-foreground">Generate interactive Mermaid diagrams to visualize smart contract workflows and interactions.</p>
                            </div>
                            
                            {/* Feature 4 */}
                            <div className="group rounded-xl border p-6 hover:border-primary/50">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                                    </svg>
                                </div>
                                <h3 className="mb-2 text-xl font-semibold">Real-time Market Data</h3>
                                <p className="text-muted-foreground">Access live SOL prices and market insights powered by integrated price feeds.</p>
                            </div>
                            
                            {/* Feature 5 */}
                            <div className="group rounded-xl border p-6 hover:border-primary/50">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                        <path d="M9 12l2 2 4-4"/>
                                        <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1"/>
                                        <path d="M3 10v4c0 .552.448 1 1 1h16c.552 0 1-.448 1-1v-4"/>
                                    </svg>
                                </div>
                                <h3 className="mb-2 text-xl font-semibold">Secure Credential System</h3>
                                <p className="text-muted-foreground">Military-grade encryption for wallet credentials with autonomous AI agent access for instant operations on Solana.</p>
                            </div>
                            
                            {/* Feature 6 */}
                            <div className="group rounded-xl border p-6 hover:border-primary/50">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                                        <line x1="8" y1="21" x2="16" y2="21"/>
                                        <line x1="12" y1="17" x2="12" y2="21"/>
                                    </svg>
                                </div>
                                <h3 className="mb-2 text-xl font-semibold">Premium Subscription Tiers</h3>
                                <p className="text-muted-foreground">Multiple subscription levels with increasing capabilities and priority transaction processing.</p>
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* About Section */}
                <section id="about" className="bg-background/50 pb-32 pt-32">
                    <div className="mx-auto max-w-7xl px-6">
                        <div className="grid items-center gap-12 lg:grid-cols-2">
                            <div>
                                <h2 className="mb-4 text-4xl font-bold md:text-5xl">Powered by Advanced AI</h2>
                                <p className="mb-6 text-muted-foreground">
                                    Astrax employs cutting-edge technology designed for performance, security, and seamless blockchain interactions on Solana.
                                </p>
                                
                                <ul className="space-y-4">
                                    <li className="flex items-start gap-2">
                                        <div className="flex-shrink-0 text-primary">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                <polyline points="22 4 12 14.01 9 11.01"/>
                                            </svg>
                                        </div>
                                        <span><strong>Frontend:</strong> Next.js with TypeScript and Solana Wallet Adapter integration</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <div className="flex-shrink-0 text-primary">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                <polyline points="22 4 12 14.01 9 11.01"/>
                                            </svg>
                                        </div>
                                        <span><strong>AI Engine:</strong> Google Gemini AI with Agent Kit SDK for advanced reasoning</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <div className="flex-shrink-0 text-primary">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                <polyline points="22 4 12 14.01 9 11.01"/>
                                            </svg>
                                        </div>
                                        <span><strong>Blockchain:</strong> Solana with SPL tokens and on-chain programs</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <div className="flex-shrink-0 text-primary">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                <polyline points="22 4 12 14.01 9 11.01"/>
                                            </svg>
                                        </div>
                                        <span><strong>Protocol:</strong> MCP Server/Client for agent communication</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <div className="flex-shrink-0 text-primary">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                <polyline points="22 4 12 14.01 9 11.01"/>
                                            </svg>
                                        </div>
                                        <span><strong>Storage:</strong> MongoDB + Pinata IPFS for secure data and NFT metadata</span>
                                    </li>
                                </ul>
                            </div>
                            
                            <div className="rounded-xl border p-4">
                                <img 
                                    src="/ai.png" 
                                    alt="Blockchain Technology" 
                                    className="rounded-lg w-full object-contain mx-auto" 
                                />
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* Pricing Section */}
                <section id="pricing" className="bg-background pb-32 pt-32">
                    <div className="mx-auto max-w-7xl px-6">
                        <div className="mb-16 text-center">
                            <h2 className="mb-4 text-4xl font-bold md:text-5xl">Simple, Transparent Pricing</h2>
                            <p className="mx-auto max-w-2xl text-muted-foreground">
                                Get started with our testnet access plan - more pricing options coming soon!
                            </p>
                        </div>
                        
                        <div className="grid gap-8 justify-center">
                            {/* Testnet Access Plan */}
                            <div className="flex flex-col rounded-xl border border-primary bg-card p-8 relative max-w-md mx-auto">
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
                                    Available Now
                                </div>
                                
                                <div className="mb-6">
                                    <h3 className="mb-2 text-xl font-medium">Testnet Access</h3>
                                    <div className="mb-2 flex items-baseline">
                                        <span className="text-4xl font-bold">0.1 S</span>
                                        <span className="text-muted-foreground ml-2">one-time</span>
                                    </div>
                                    <p className="text-muted-foreground">Full platform access on Solana devnet</p>
                                </div>
                                
                                <ul className="mb-8 space-y-3 text-sm">
                                    <li className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                            <polyline points="22 4 12 14.01 9 11.01"/>
                                        </svg>
                                        <span>Complete AI chat interface</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                            <polyline points="22 4 12 14.01 9 11.01"/>
                                        </svg>
                                        <span>Smart contract deployment</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                            <polyline points="22 4 12 14.01 9 11.01"/>
                                        </svg>
                                        <span>Token & NFT creation</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                            <polyline points="22 4 12 14.01 9 11.01"/>
                                        </svg>
                                        <span>Payment scheduling system</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                            <polyline points="22 4 12 14.01 9 11.01"/>
                                        </svg>
                                        <span>Workflow visualization</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                            <polyline points="22 4 12 14.01 9 11.01"/>
                                        </svg>
                                        <span>Real-time market data</span>
                                    </li>
                                </ul>
                                
                                <div className="mt-auto">
                                    <Button asChild className="w-full">
                                        <Link href="/ai-chat">Get Started</Link>
                                    </Button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-12 text-center">
                                <p className="text-muted-foreground text-sm">
                                    🚀 More pricing plans coming soon for Solana mainnet launch
                                </p>
                        </div>
                    </div>
                </section>
                
                {/* Testimonials Section */}
                <TestimonialsSection
                  title="Trusted by developers worldwide"
                  description="Join thousands of developers who are building the future with our AI-powered blockchain agent"
                  testimonials={[
                    {
                      author: {
                        name: "Sarah Chen",
                        handle: "@sarahdev",
                        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face"
                      },
                      text: "Astrax has completely transformed how I interact with smart contracts. Deploying an NFT collection used to take hours, now it's done in minutes with a simple chat command!",
                      href: "https://twitter.com/sarahdev"
                    },
                    {
                      author: {
                        name: "Marcus Thompson",
                        handle: "@marcussonic",
                        avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face"
                      },
                      text: "The payment scheduling feature is a game-changer for our DAO. Setting up monthly salary payments for 50+ contributors takes just one command. Incredible efficiency!",
                      href: "https://twitter.com/marcuscrossfi"
                    },
                    {
                      author: {
                        name: "Elena Rodriguez",
                        handle: "@elenaai",
                        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face"
                      },
                      text: "The workflow visualization with Mermaid diagrams helps our team understand complex contract interactions. The AI explanations are spot-on and incredibly helpful."
                    }
                  ]}
                />
                
                {/* Footer */}
                <footer className="bg-background border-t py-12 md:py-16">
                    <div className="mx-auto max-w-7xl px-6">
                        <div className="grid gap-8 md:grid-cols-4">
                            <div className="md:col-span-2">
                                <Logo className="mb-4" />
                                <p className="mb-4 max-w-xs text-muted-foreground">
                                    Your AI agent for seamless blockchain interactions on Solana.
                                </p>
                                <div className="flex space-x-4">
                                    <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                            <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
                                        </svg>
                                    </a>
                                    <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                            <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                                            <rect width="4" height="12" x="2" y="9"/>
                                            <circle cx="4" cy="4" r="2"/>
                                        </svg>
                                    </a>
                                    <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                                            <path d="M12 2H2v10h10V2Z"/>
                                            <path d="M22 12H12v10h10V12Z"/>
                                            <path d="M22 2h-8v8h8V2Z"/>
                                        </svg>
                                    </a>
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="mb-3 text-sm font-semibold">Platform</h3>
                                <ul className="space-y-2 text-sm">
                                    <li><a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
                                    <li><a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a></li>
                                    <li><a href="#about" className="text-muted-foreground hover:text-foreground transition-colors">About</a></li>
                                    <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Documentation</a></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 className="mb-3 text-sm font-semibold">Legal</h3>
                                <ul className="space-y-2 text-sm">
                                    <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a></li>
                                    <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a></li>
                                    <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Cookie Policy</a></li>
                                </ul>
                            </div>
                        </div>
                        
                        <div className="mt-10 border-t pt-6">
                            <p className="text-center text-xs text-muted-foreground">
                                © {new Date().getFullYear()} Astrax. All rights reserved. Built for Solana with ❤️
                            </p>
                        </div>
                    </div>
                </footer>
            </main>
        </>
    )
}

const menuItems = [
    { name: 'Features', href: '#features' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'About', href: '#about' },
    { name: 'Testimonials', href: '#testimonials' },
]

const HeroHeader = () => {
    const [menuState, setMenuState] = React.useState(false)
    const [isScrolled, setIsScrolled] = React.useState(false)

    React.useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])
    return (
        <header>
            <nav
                data-state={menuState && 'active'}
                className="fixed z-20 w-full px-2 group">
                <div className={cn('mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12', isScrolled && 'bg-background/50 max-w-4xl rounded-2xl border backdrop-blur-lg lg:px-5')}>
                    <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
                        <div className="flex w-full justify-between lg:w-auto">
                            <Link
                                href="/"
                                aria-label="home"
                                className="flex items-center space-x-2">
                                <Logo />
                            </Link>

                            <button
                                onClick={() => setMenuState(!menuState)}
                                aria-label={menuState == true ? 'Close Menu' : 'Open Menu'}
                                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden">
                                <Menu className="in-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                            </button>
                        </div>

                        <div className="absolute inset-0 m-auto hidden size-fit lg:block">
                            <ul className="flex gap-8 text-sm">
                                {menuItems.map((item, index) => (
                                    <li key={index}>
                                        <Link
                                            href={item.href}
                                            className="text-muted-foreground hover:text-accent-foreground block duration-150">
                                            <span>{item.name}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="bg-background group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                            <div className="lg:hidden">
                                <ul className="space-y-6 text-base">
                                    {menuItems.map((item, index) => (
                                        <li key={index}>
                                            <Link
                                                href={item.href}
                                                className="text-muted-foreground hover:text-accent-foreground block duration-150">
                                                <span>{item.name}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                                <Button
                                    asChild
                                    size="sm">
                                    <Link href="/ai-chat">
                                        <span>Launch AI Assistant</span>
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>
        </header>
    )
}

const Logo = ({ className }: { className?: string }) => {
    return (
        <div className={cn('flex items-center gap-2', className)}>
            <img 
                src="/logo.png" 
                alt="Solana Network" 
                className="w-8 h-8 object-contain" 
            />
            <div className="font-bold text-xl bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent dark:from-white dark:to-gray-400">
                Astrax
            </div>
        </div>
    )
}
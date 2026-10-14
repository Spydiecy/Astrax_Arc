"use client"

import React from 'react'
import Link from 'next/link'
import {
    ArrowRight, Menu, X, CheckCircle2, Send, CalendarClock, Link2, ShieldCheck, Wallet, LineChart,
    Coins, Rocket, BookUser, Boxes, Code2, Globe, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnimatedGroup } from '@/components/ui/animated-group'
import { cn } from '@/lib/utils'
import { TechStack } from '@/components/blocks/tech-stack'
import { PromptMarquee } from '@/components/blocks/prompt-marquee'

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Send, title: 'Chat to act on-chain', body: 'Send USDC, EURC or any ERC-20, deploy your own ERC-20 tokens, or attach an image and mint it as a 1-of-1 NFT with its metadata on IPFS. Pay saved contacts by name.' },
    { icon: Code2, title: 'Deploy your own smart contracts', body: 'Describe a contract in plain English, like a counter, a vote or an escrow. Astrax writes the Solidity, compiles it, dry-runs it and deploys it in one message.' },
    { icon: Boxes, title: 'Talk to your contracts', body: 'A Smart contracts tab lists everything you deployed, with live values. Say "increment the counter" or tap a function and Astrax calls it, checking every write first.' },
    { icon: CalendarClock, title: 'Scheduled payments', body: 'One-off or recurring transfers, like a weekly allowance or a monthly salary, sent automatically, even after you close the app.' },
    { icon: Link2, title: 'Payment links that track themselves', body: 'Share a link or QR code. Astrax spots the USDC payment on-chain and marks the link paid, with the transaction.' },
    { icon: ShieldCheck, title: 'Explain anything', body: 'Paste a transaction, wallet, token or contract and get a plain-English breakdown with risk flags before you trust it.' },
    { icon: Globe, title: 'Arc Mainnet and Testnet', body: 'Switch networks in one click. Try everything with free test USDC on Testnet, then move to Mainnet. Fees are paid in USDC and cost a fraction of a cent.' },
    { icon: Wallet, title: 'Your keys, your choice', body: 'Approve every transaction in your own EVM wallet, or go hands-free with a dedicated key. Your contacts, links, schedules and contracts are only visible to your wallet.' },
    { icon: LineChart, title: 'Prices, charts and diagrams', body: 'Live USDC, EURC, ETH and BTC market data, candlestick charts, and Mermaid diagrams of any flow. Chats stay private in your browser.' },
]
const STACK_NOTES: { title: string; body: string }[] = [
    { title: 'Interface', body: 'Next.js 15 and React 19, with chat history kept only in your browser.' },
    { title: 'AI agent', body: 'Vercel AI SDK streaming Mistral ministral-8b, calling typed tools for every action.' },
    { title: 'Wallets', body: 'RainbowKit and wagmi for MetaMask, Rabby, Coinbase Wallet, WalletConnect and any injected EVM wallet. Ownership is proven with a free EIP-191 signed message.' },
    { title: 'Chain', body: 'viem on Arc Mainnet and Arc Testnet, with USDC as gas. Contracts you ask for are compiled on the server with solc (OpenZeppelin v5 supported) and deployed from chat.' },
    { title: 'Storage', body: 'libSQL locally or Turso when hosted, one row per wallet. Files and NFT metadata on IPFS via Pinata.' },
]

const PLAN_ITEMS = [
    'AI chat with copy, edit and regenerate',
    'USDC, EURC & ERC-20 transfers',
    'ERC-20 token & NFT creation with image upload',
    'Write, compile & deploy custom smart contracts',
    'Smart contracts tab, with live values',
    'Call your contracts from chat, writes checked first',
    'Scheduled & recurring payments',
    'Tracked payment links with QR codes',
    'Per-wallet contacts',
    'Explain any transaction or address',
    'Market data, charts and diagrams',
    'Arc Mainnet & Testnet switcher',
]

const EXAMPLES: { icon: LucideIcon; text: string }[] = [
    { icon: Wallet, text: "What's my USDC balance?" },
    { icon: Send, text: 'Send 5 USDC to alice' },
    { icon: Rocket, text: 'Create a token MoonCoin MOON supply 1000000' },
    { icon: Link2, text: 'Payment link for 50 USDC for logo design' },
    { icon: CalendarClock, text: 'Pay bob 10 USDC every week, 4 times' },
    { icon: ShieldCheck, text: 'Is this address safe? <address>' },
    { icon: BookUser, text: 'Save alice as <address>' },
    { icon: LineChart, text: 'Show the ETH price chart for 30 days' },
    { icon: Coins, text: 'Create an NFT called Genesis with this image' },
    { icon: Code2, text: 'Create and deploy a simple counter contract' },
    { icon: Code2, text: 'Increment the counter' },
    { icon: Boxes, text: "What's the count on my counter?" },
    { icon: Boxes, text: 'Show the latest blocks' },
]

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
                                        href="#features"
                                        className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-black/5 transition-all duration-300 dark:border-t-white/5 dark:shadow-zinc-950">
                                        <span className="text-foreground text-sm inline-flex items-center gap-1.5">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src="/chain/arc.png" alt="" className="h-4 w-4 rounded-full" />
                                            Deploy smart contracts from chat · live on Arc
                                        </span>
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
                                        <span className="text-red-400">Astrax</span> AI Agent for Arc
                                    </h1>
                                    <p
                                        className="mx-auto mt-8 max-w-2xl text-balance text-lg">
                                        Send USDC, create tokens and NFTs, deploy your own smart contracts, schedule payments and share payment links that track themselves on Arc Mainnet and Testnet, all by chatting. Approve every step in your own wallet.
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
                                        <Link href="#features">
                                            <span className="text-nowrap">See what it does</span>
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
                                        alt="Astrax chat on Arc with a balance card, a price chart and a payment link"
                                        width="2700"
                                        height="1440"
                                    />
                                    <img
                                        className="z-2 border-border/25 aspect-15/8 relative rounded-2xl border dark:hidden"
                                        src="/hero.png"
                                        alt="Astrax chat on Arc with a balance card, a price chart and a payment link"
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
                            <h2 className="mb-4 text-4xl font-bold md:text-5xl">What Astrax does</h2>
                            <p className="mx-auto max-w-2xl text-muted-foreground">
                                Say what you want in plain English. Astrax picks the right on-chain action and shows you exactly what it will do.
                            </p>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {FEATURES.map(({ icon: Icon, title, body }) => (
                                <div key={title} className="group rounded-xl border p-6 transition-colors hover:border-primary/50">
                                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <Icon className="size-6" aria-hidden />
                                    </div>
                                    <h3 className="mb-2 text-xl font-semibold">{title}</h3>
                                    <p className="text-muted-foreground">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Stack Section */}
                <section id="stack" className="bg-background/50 pb-32 pt-32">
                    <div className="mx-auto max-w-7xl px-6">
                        <div className="grid items-center gap-12 lg:grid-cols-2">
                            <div>
                                <h2 className="mb-4 text-4xl font-bold md:text-5xl">How it&apos;s built</h2>
                                <p className="mb-6 text-muted-foreground">
                                    One Next.js app, from the chat you type in down to where your data lives. No separate backend to run.
                                </p>

                                <ul className="space-y-4">
                                    {STACK_NOTES.map(({ title, body }) => (
                                        <li key={title} className="flex items-start gap-3">
                                            <CheckCircle2 className="mt-0.5 size-5 flex-shrink-0 text-primary" aria-hidden />
                                            <span><strong>{title}:</strong> {body}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <TechStack />
                        </div>
                    </div>
                </section>

                {/* Pricing Section */}
                <section id="pricing" className="bg-background pb-32 pt-32">
                    <div className="mx-auto max-w-7xl px-6">
                        <div className="mb-16 text-center">
                            <h2 className="mb-4 text-4xl font-bold md:text-5xl">Simple, Transparent Pricing</h2>
                            <p className="mx-auto max-w-2xl text-muted-foreground">
                                Free while in beta. You only pay Arc network fees, in USDC, usually a fraction of a cent.
                            </p>
                        </div>

                        <div className="grid gap-8 justify-center">
                            <div className="flex flex-col rounded-xl border border-primary bg-card p-8 relative max-w-md mx-auto">
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
                                    Available Now
                                </div>

                                <div className="mb-6">
                                    <h3 className="mb-2 text-xl font-medium">Arc Mainnet + Testnet</h3>
                                    <div className="mb-2 flex items-baseline">
                                        <span className="text-4xl font-bold">Free</span>
                                        <span className="text-muted-foreground ml-2">during beta</span>
                                    </div>
                                    <p className="text-muted-foreground">Everything below, on both Arc networks</p>
                                </div>

                                <ul className="mb-8 space-y-3 text-sm">
                                    {PLAN_ITEMS.map((item) => (
                                        <li key={item} className="flex items-center gap-2">
                                            <CheckCircle2 className="size-4 flex-shrink-0 text-primary" aria-hidden />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-auto">
                                    <Button asChild className="w-full">
                                        <Link href="/ai-chat">Get Started</Link>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 text-center">
                            <p className="text-muted-foreground text-sm">New to Arc? Try it on Testnet with free USDC from the <a className="underline" href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a>.</p>
                        </div>
                    </div>
                </section>

                {/* Example prompts */}
                <section id="examples" className="bg-background py-12 sm:py-24 md:py-32">
                    <div className="mx-auto flex flex-col items-center gap-4 text-center sm:gap-16">
                        <div className="flex flex-col items-center gap-4 px-4 sm:gap-8">
                            <h2 className="max-w-[720px] text-3xl font-semibold leading-tight sm:text-5xl sm:leading-tight">
                                Just say it
                            </h2>
                            <p className="text-md max-w-[600px] font-medium text-muted-foreground sm:text-xl">
                                A few things you can ask Astrax right now.
                            </p>
                        </div>

                        <PromptMarquee prompts={EXAMPLES} />

                        <Button asChild size="lg" className="rounded-xl px-5">
                            <Link href="/ai-chat">Try it now</Link>
                        </Button>
                    </div>
                </section>

                {/* Footer */}
                <footer className="bg-background border-t py-12 md:py-16">
                    <div className="mx-auto max-w-7xl px-6">
                        <div className="grid gap-8 md:grid-cols-4">
                            <div className="md:col-span-3">
                                <Logo className="mb-4" />
                                <p className="mb-4 max-w-sm text-muted-foreground">
                                    Your AI agent for Arc. Chat in plain English, act on-chain.
                                </p>
                            </div>

                            <div>
                                <h3 className="mb-3 text-sm font-semibold">Product</h3>
                                <ul className="space-y-2 text-sm">
                                    {menuItems.map((item) => (
                                        <li key={item.href}>
                                            <a href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">{item.name}</a>
                                        </li>
                                    ))}
                                    <li><Link href="/ai-chat" className="text-muted-foreground hover:text-foreground transition-colors">Launch app</Link></li>
                                </ul>
                            </div>
                        </div>

                        <div className="mt-10 border-t pt-6">
                            <p className="text-center text-xs text-muted-foreground">
                                © {new Date().getFullYear()} Astrax. Built for Arc with ❤️ · Live on Arc Mainnet and Testnet
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
    { name: 'Stack', href: '#stack' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'Examples', href: '#examples' },
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
                alt="" 
                className="w-8 h-8 object-contain" 
            />
            <div className="font-bold text-xl bg-gradient-to-b from-gray-900 to-gray-600 bg-clip-text text-transparent dark:from-white dark:to-gray-400">
                Astrax
            </div>
        </div>
    )
}
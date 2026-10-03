"use client"

import { cn } from "@/lib/utils"

export interface TestimonialAuthor {
  name: string
  handle: string
  avatar: string
}

interface TestimonialCardProps {
  author: TestimonialAuthor
  text: string
  href?: string
}

export function TestimonialCard({ author, text, href }: TestimonialCardProps) {
  return (
    <div className="group flex w-80 flex-col gap-4 rounded-xl border p-6 shadow-sm transition-all duration-300 hover:border-primary/50 hover:shadow-md sm:w-96">
      <div className="relative">
        <div className="text-lg font-medium leading-relaxed text-muted-foreground">
          "{text}"
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <img 
          src={author.avatar} 
          alt={author.name} 
          className="size-10 rounded-full object-cover"
        />
        <div className="flex flex-col">
          <div className="font-medium">{author.name}</div>
          <div className="text-sm text-muted-foreground">{author.handle}</div>
        </div>
      </div>
    </div>
  )
}

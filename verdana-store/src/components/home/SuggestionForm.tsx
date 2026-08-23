"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"

export function SuggestionForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [comment, setComment] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) {
      setError("Please tell us what you'd like to see.")
      setStatus("error")
      return
    }
    setStatus("sending")
    setError("")
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, comment }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not send. Please try again.")
      setStatus("sent")
      setName("")
      setEmail("")
      setPhone("")
      setComment("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setStatus("error")
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-8 rounded-2xl bg-verdana-teal/5 border border-verdana-teal/20 p-8 text-center">
        <p className="text-lg font-semibold text-verdana-charcoal">Thank you! 🌱</p>
        <p className="mt-1 text-sm text-gray-600">
          We&apos;ve received your suggestion and our team will take a look.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm font-medium text-verdana-teal hover:text-verdana-dark-teal"
        >
          Send another suggestion
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="home-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input id="home-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Your name" />
        </div>
        <div>
          <label htmlFor="home-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input id="home-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
        </div>
      </div>
      <div>
        <label htmlFor="home-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <input id="home-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="Your phone number" />
      </div>
      <div>
        <label htmlFor="home-comment" className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
        <textarea id="home-comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputClass} resize-none`} placeholder="Tell us what products you'd like to see..." />
      </div>
      {status === "error" && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={status === "sending"} className="w-full sm:w-auto">
        {status === "sending" ? "Sending…" : "Submit"}
      </Button>
    </form>
  )
}

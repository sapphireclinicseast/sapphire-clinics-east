"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Package,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface CollectionWithCount {
  id: string
  slug: string
  name: string
  description: string
  imageUrl: string
  productCount: number
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<CollectionWithCount[]>([])
  const [loading, setLoading] = useState(true)

  // New collection form
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [creating, setCreating] = useState(false)

  // Edit state
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editImageUrl, setEditImageUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState<string | null>(null)

  useEffect(() => {
    loadCollections()
  }, [])

  async function loadCollections() {
    const res = await fetch("/api/admin/collections")
    const data = await res.json()
    setCollections(data.collections || [])
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return

    setCreating(true)
    try {
      const res = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() }),
      })
      if (res.ok) {
        setNewName("")
        setNewDescription("")
        setShowNewForm(false)
        await loadCollections()
      }
    } catch (err) {
      console.error("Failed to create collection:", err)
    }
    setCreating(false)
  }

  function startEditing(c: CollectionWithCount) {
    setEditingSlug(c.slug)
    setEditName(c.name)
    setEditDescription(c.description)
    setEditImageUrl(c.imageUrl)
  }

  async function handleSaveEdit() {
    if (!editingSlug || !editName.trim()) return
    setSaving(true)
    try {
      await fetch("/api/admin/collections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: editingSlug,
          name: editName.trim(),
          description: editDescription.trim(),
          imageUrl: editImageUrl,
        }),
      })
      setEditingSlug(null)
      await loadCollections()
    } catch (err) {
      console.error("Failed to update collection:", err)
    }
    setSaving(false)
  }

  async function handleCollectionImageUpload(slug: string, file: File) {
    setUploadingImage(slug)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("productSlug", slug)
      formData.append("type", "collection")
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (data.url) {
        // Save the image URL to the collection
        await fetch("/api/admin/collections", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, imageUrl: data.url }),
        })
        await loadCollections()
        if (editingSlug === slug) setEditImageUrl(data.url)
      }
    } catch (err) {
      console.error("Failed to upload collection image:", err)
    }
    setUploadingImage(null)
  }

  async function handleDelete(slug: string, name: string, productCount: number) {
    if (productCount > 0) {
      alert(`Cannot delete "${name}" — it has ${productCount} product(s). Move or delete them first.`)
      return
    }
    if (!confirm(`Delete category "${name}"?`)) return

    try {
      const res = await fetch(`/api/admin/collections?slug=${slug}`, { method: "DELETE" })
      if (res.ok) await loadCollections()
    } catch (err) {
      console.error("Failed to delete collection:", err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-verdana-teal" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-verdana-charcoal">Categories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage product categories. {collections.length} total.
          </p>
        </div>
        <Button onClick={() => setShowNewForm(!showNewForm)}>
          <Plus className="h-4 w-4" />
          New Category
        </Button>
      </div>

      {/* New category form */}
      {showNewForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-verdana-teal/30 bg-verdana-teal/5 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-verdana-charcoal">New Category</h3>
          <div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              required
              autoFocus
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
            />
          </div>
          <div>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Short description (optional)"
              rows={2}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNewForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating || !newName.trim()}>
              {creating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
              ) : (
                "Create Category"
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Collections list */}
      <div className="space-y-3">
        {collections.map((c) => (
          <div
            key={c.slug}
            className="rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300"
          >
            {editingSlug === c.slug ? (
              /* Editing mode */
              <div className="space-y-3">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal"
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingSlug(null)}
                    className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="rounded-lg bg-verdana-teal p-2 text-white hover:bg-verdana-dark-teal transition-all"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : (
              /* Display mode */
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-50 border border-gray-200">
                    {c.imageUrl ? (
                      <Image src={c.imageUrl} alt={c.name} fill unoptimized={c.imageUrl.startsWith("/api/uploads")} className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <FolderOpen className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                    <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/0 hover:bg-black/40 transition-all group/upload">
                      <Upload className="h-4 w-4 text-white opacity-0 group-hover/upload:opacity-100 transition-opacity" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleCollectionImageUpload(c.slug, e.target.files[0])
                        }}
                      />
                    </label>
                    {uploadingImage === c.slug && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                        <Loader2 className="h-4 w-4 animate-spin text-verdana-teal" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-verdana-charcoal">{c.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{c.description || "No description"}</p>
                    <Link
                      href={`/admin?collection=${c.slug}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-verdana-teal hover:underline"
                    >
                      <Package className="h-3 w-3" />
                      {c.productCount} product{c.productCount !== 1 ? "s" : ""}
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEditing(c)}
                    className="rounded-lg p-2 text-gray-400 hover:text-verdana-teal hover:bg-verdana-teal/10 transition-all"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.slug, c.name, c.productCount)}
                    className="rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {collections.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
            <FolderOpen className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-3 text-gray-500">No categories yet</p>
            <button
              onClick={() => setShowNewForm(true)}
              className="mt-3 text-sm text-verdana-teal hover:underline"
            >
              Create your first category
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

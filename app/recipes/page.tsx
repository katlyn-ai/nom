'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'

type Recipe = {
  id: string
  name: string
  description: string
  ingredients: string[]
  instructions: string
  rating: number | null
  servings: number
  prep_time: number
  tags: string[]
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', ingredients: '', instructions: '',
    servings: 4, prep_time: 30, tags: '',
  })
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from('recipes')
        .select('*')
        .eq('user_id', user.id)
        .order('name')
      setRecipes(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!userId || !form.name) return
    const { data } = await supabase.from('recipes').insert({
      user_id: userId,
      name: form.name,
      description: form.description,
      ingredients: form.ingredients.split('\n').filter(Boolean),
      instructions: form.instructions,
      servings: form.servings,
      prep_time: form.prep_time,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }).select().single()
    if (data) {
      setRecipes(prev => [...prev, data])
      setForm({ name: '', description: '', ingredients: '', instructions: '', servings: 4, prep_time: 30, tags: '' })
      setShowAdd(false)
    }
  }

  const handleRate = async (id: string, rating: number) => {
    await supabase.from('recipes').update({ rating }).eq('id', id)
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, rating } : r))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, rating } : null)
  }

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  const StarRating = ({ recipe }: { recipe: Recipe }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={() => handleRate(recipe.id, star)}
          className="text-lg hover:scale-110 transition-transform"
        >
          {star <= (recipe.rating || 0) ? '⭐' : '☆'}
        </button>
      ))}
    </div>
  )

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <div className="md:ml-64 flex items-center justify-center h-screen">
        <p style={{ color: 'var(--muted)' }}>Loading recipes…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Recipe Book</h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>{recipes.length} recipes saved</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2.5 rounded-xl text-white text-sm font-medium"
            style={{ background: 'var(--primary)' }}
          >
            + Add recipe
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recipes or tags…"
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-6"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
        />

        {/* Recipe list */}
        {filtered.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-4xl mb-3">📖</p>
            <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>No recipes yet</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Add your first recipe to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map(recipe => (
              <div
                key={recipe.id}
                onClick={() => setSelected(recipe)}
                className="rounded-2xl p-5 cursor-pointer hover:shadow-sm transition-shadow"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium" style={{ color: 'var(--foreground)' }}>{recipe.name}</h3>
                </div>
                {recipe.description && (
                  <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--muted)' }}>
                    {recipe.description}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <StarRating recipe={recipe} />
                  <div className="flex gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                    {recipe.prep_time && <span>⏱ {recipe.prep_time}m</span>}
                    {recipe.servings && <span>👥 {recipe.servings}</span>}
                  </div>
                </div>
                {recipe.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {recipe.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recipe detail modal */}
        {selected && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setSelected(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
              style={{ background: 'var(--card)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>{selected.name}</h2>
                <button onClick={() => setSelected(null)} style={{ color: 'var(--muted)' }}>✕</button>
              </div>
              <StarRating recipe={selected} />
              {selected.description && (
                <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>{selected.description}</p>
              )}
              {selected.ingredients?.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium text-sm mb-2" style={{ color: 'var(--foreground)' }}>Ingredients</p>
                  <ul className="space-y-1">
                    {selected.ingredients.map((ing, i) => (
                      <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--muted)' }}>
                        <span>•</span> {ing}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.instructions && (
                <div className="mt-4">
                  <p className="font-medium text-sm mb-2" style={{ color: 'var(--foreground)' }}>Instructions</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--muted)' }}>{selected.instructions}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add recipe modal */}
        {showAdd && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowAdd(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
              style={{ background: 'var(--card)' }}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Add recipe</h2>
              <div className="space-y-4">
                {[
                  { label: 'Recipe name', key: 'name', placeholder: 'e.g. Spaghetti Carbonara' },
                  { label: 'Description (optional)', key: 'description', placeholder: 'A short description…' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={form[field.key as keyof typeof form] as string}
                      onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                    Ingredients (one per line)
                  </label>
                  <textarea
                    value={form.ingredients}
                    onChange={e => setForm(prev => ({ ...prev, ingredients: e.target.value }))}
                    placeholder="200g pasta&#10;2 eggs&#10;100g pancetta"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                    Instructions
                  </label>
                  <textarea
                    value={form.instructions}
                    onChange={e => setForm(prev => ({ ...prev, instructions: e.target.value }))}
                    placeholder="Step by step instructions…"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Servings</label>
                    <input
                      type="number"
                      value={form.servings}
                      onChange={e => setForm(prev => ({ ...prev, servings: +e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Prep time (min)</label>
                    <input
                      type="number"
                      value={form.prep_time}
                      onChange={e => setForm(prev => ({ ...prev, prep_time: +e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Tags (comma separated)</label>
                  <input
                    type="text"
                    value={form.tags}
                    onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="pasta, quick, vegetarian"
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-xl text-white text-sm font-medium"
                    style={{ background: 'var(--primary)' }}
                  >
                    Save recipe
                  </button>
                  <button
                    onClick={() => setShowAdd(false)}
                    className="px-5 py-3 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--border)', color: 'var(--muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

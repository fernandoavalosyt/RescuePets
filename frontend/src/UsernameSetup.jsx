import { useState } from 'react'
import * as api from './api'
import { validateUsername } from './validators'
import { PawHeartIcon } from './Icons'

/** Pantalla para elegir el nombre de usuario público (aparece en tus publicaciones y comentarios). */
export default function UsernameSetup({ user, onDone, onSkip }) {
  const [username, setUsername] = useState('')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  const clientError = validateUsername(username)
  const error = (touched && clientError) || serverError

  async function submit(e) {
    e.preventDefault()
    setTouched(true)
    if (clientError) return
    setLoading(true)
    setServerError('')
    try {
      const { user: updated } = await api.updateProfile({ username })
      onDone(updated)
    } catch (err) {
      setServerError(err.fields?.username || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAF8] p-4 text-[#133E37]">
      <form onSubmit={submit} noValidate className="w-full max-w-md space-y-4 rounded-3xl border border-[#BCD2C6] bg-white p-8 shadow-sm">
        <PawHeartIcon className="h-12 w-12" />
        <div>
          <h1 className="text-2xl font-black">Elige tu nombre de usuario</h1>
          <p className="mt-1 text-sm text-[#133E37]/70">
            Así te verán los demás en tus publicaciones y comentarios. Ahora mismo eres <strong>@{user.username}</strong>.
          </p>
        </div>

        <div>
          <label htmlFor="username" className="mb-1 block text-xs font-bold uppercase tracking-wider">Nombre de usuario</label>
          <div className="flex items-center rounded-xl border border-gray-200 focus-within:border-[#133E37] aria-invalid:border-red-500" aria-invalid={!!error}>
            <span className="pl-4 text-[#133E37]/60">@</span>
            <input
              id="username"
              value={username}
              onChange={(e) => { setUsername(e.target.value.toLowerCase()); setServerError('') }}
              onBlur={() => setTouched(true)}
              maxLength={30}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              aria-invalid={!!error}
              aria-describedby="username-hint"
              className="w-full rounded-xl bg-transparent px-2 py-2.5 focus:outline-none"
            />
          </div>
          {error
            ? <p id="username-hint" className="mt-1 text-xs text-red-600" role="alert">{error}</p>
            : <p id="username-hint" className="mt-1 text-xs text-gray-400">3–30 caracteres: letras, números y guion bajo. Empieza con una letra.</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#133E37] py-3 font-bold text-white transition-colors hover:bg-[#0f322c] disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? 'Guardando…' : 'Guardar y continuar'}
        </button>
        <button type="button" onClick={onSkip} className="mx-auto block text-sm underline">Omitir por ahora</button>
      </form>
    </main>
  )
}

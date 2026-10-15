import { useEffect, useState } from 'react'
import * as api from './api'
import { validateIdentifier, validatePassword } from './validators'
import AppShell from './AppShell'
import AdminApp from './admin/AdminApp'
import { forgetDevice } from './usePush'
import UsernameSetup from './UsernameSetup'
import './App.css'

// Un texto con letras y sin "@" no puede ser correo ni teléfono: se intenta como cuenta de administrador.
// El servidor decide; aquí no se revela si existe.
const looksLikeAdmin = (v) => /^[A-Za-z][A-Za-z0-9_.-]{2,29}$/.test(v.trim())

function AuthForm({ mode, onLoggedIn, onAdminLoggedIn, onRegistered }) {
  const isRegister = mode === 'register'
  const [values, setValues] = useState({ identifier: '', password: '', confirmPassword: '' })
  const [touched, setTouched] = useState({})
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  const adminTry = !isRegister && looksLikeAdmin(values.identifier)
  const errors = {
    identifier: adminTry ? '' : validateIdentifier(values.identifier),
    password: isRegister ? validatePassword(values.password) : values.password ? '' : 'La contraseña es obligatoria.',
    confirmPassword: isRegister && values.password !== values.confirmPassword ? 'Las contraseñas no coinciden.' : '',
  }
  const shown = (f) => (touched[f] && errors[f]) || serverErrors[f] || ''

  const change = (f) => (e) => {
    setValues((v) => ({ ...v, [f]: e.target.value }))
    setServerErrors((s) => ({ ...s, [f]: '' }))
  }
  const blur = (f) => () => setTouched((t) => ({ ...t, [f]: true }))

  async function submit(e) {
    e.preventDefault()
    setTouched({ identifier: true, password: true, confirmPassword: true })
    setFormError('')
    if (errors.identifier || errors.password || errors.confirmPassword) return
    setLoading(true)
    try {
      if (isRegister) {
        await api.register(values)
        onRegistered()
      } else if (adminTry) {
        const { admin } = await api.adminLogin({ username: values.identifier.trim(), password: values.password })
        onAdminLoggedIn(admin)
      } else {
        const { user } = await api.login(values)
        onLoggedIn(user)
      }
    } catch (err) {
      setServerErrors(err.fields || {})
      setFormError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const field = (name, label, type, extra = {}) => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={values[name]}
        onChange={change(name)}
        onBlur={blur(name)}
        aria-invalid={!!shown(name)}
        maxLength={name === 'identifier' ? 254 : 128}
        {...extra}
      />
      {shown(name) && <small className="error" role="alert">{shown(name)}</small>}
    </label>
  )

  return (
    <form onSubmit={submit} noValidate className="card">
      <h1>{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
      {field('identifier', 'Correo o teléfono', 'text', { autoComplete: 'username', inputMode: 'email' })}
      {field('password', 'Contraseña', 'password', { autoComplete: isRegister ? 'new-password' : 'current-password' })}
      {isRegister && field('confirmPassword', 'Confirmar contraseña', 'password', { autoComplete: 'new-password' })}
      {isRegister && (
        <p className="hint">Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo; sin espacios.</p>
      )}
      {formError && <p className="error form-error" role="alert">{formError}</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Procesando…' : isRegister ? 'Registrarme' : 'Entrar'}
      </button>
    </form>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [admin, setAdmin] = useState(null)
  const [mode, setMode] = useState('login')
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(false)
  // "Omitir" se recuerda mientras dure la pestaña (sobrevive a recargas y se borra al salir)
  const [skipUsername, setSkipUsernameState] = useState(() => {
    try { return sessionStorage.getItem('rp_skip_username') === '1' } catch { return false }
  })
  const setSkipUsername = (v) => {
    setSkipUsernameState(v)
    try { if (v) sessionStorage.setItem('rp_skip_username', '1'); else sessionStorage.removeItem('rp_skip_username') } catch { /* sin almacenamiento */ }
  }

  useEffect(() => {
    // Si la sesión expira mientras se usa la app, vuelve al login
    api.setUnauthorizedHandler(() => { setNotice('Tu sesión expiró. Inicia sesión de nuevo.'); setUser(null); setAdmin(null) })
    // Sesión de usuario; si no hay, se comprueba si es la del administrador
    api.me().then((d) => setUser(d.user))
      .catch(() => api.adminMe().then((d) => setAdmin(d.admin)).catch(() => {}))
      .finally(() => setReady(true))
  }, [])

  if (!ready) return null

  if (admin) {
    return <AdminApp admin={admin} onLogout={() => api.adminLogout().finally(() => setAdmin(null))} />
  }

  if (user && !user.usernameSet && !skipUsername) {
    return <UsernameSetup user={user} onDone={setUser} onSkip={() => setSkipUsername(true)} />
  }

  if (user) {
    return <AppShell user={user} onUserChange={setUser} onLogout={() => { try { sessionStorage.removeItem('rp_chat') } catch { /* nada */ } return forgetDevice().then(() => api.logout()).finally(() => { setSkipUsername(false); setUser(null) }) }} />
  }

  return (
    <main className="auth">
      {notice && <p className="notice">{notice}</p>}
      <AuthForm
        key={mode}
        mode={mode}
        onLoggedIn={setUser}
        onAdminLoggedIn={setAdmin}
        onRegistered={() => { setNotice('Cuenta creada. Ahora inicia sesión.'); setMode('login') }}
      />
      <button className="link" onClick={() => { setNotice(''); setMode(mode === 'login' ? 'register' : 'login') }}>
        {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
      </button>
    </main>
  )
}

export default App

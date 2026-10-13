import { createContext, useContext } from 'react'

/**
 * Datos compartidos por toda la app autenticada:
 *  user, coords (ubicación registrada), notify(msg, {href, label}) y
 *  subscribe(fn) -> unsubscribe: recibe cada notificación en tiempo real (para refrescar tarjetas abiertas).
 */
export const AppContext = createContext({ user: null, coords: null, notify: () => {}, subscribe: () => () => {} })
export const useApp = () => useContext(AppContext)

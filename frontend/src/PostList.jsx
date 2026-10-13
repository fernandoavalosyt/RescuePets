import PostCard from './PostCard'

/** Lista de PostCard con estados de carga, vacío, error y "Ver más". `list` viene de usePagedPosts. */
export default function PostList({ list, empty }) {
  const { posts, loading, error, hasMore, loadMore, reload, replace, removeLocal } = list
  return (
    <div className="space-y-4" aria-live="polite">
      {posts.map((p) => <PostCard key={p.id} post={p} onChange={replace} onRemove={removeLocal} />)}

      {!loading && !posts.length && !error && (
        <p className="rounded-3xl border border-dashed border-[#A3C2B2] bg-[#E9F0EC]/50 p-6 text-center text-[#133E37]/70">{empty}</p>
      )}
      {loading && <p className="text-center text-sm text-[#133E37]/60">Cargando…</p>}
      {error && (
        <p className="text-center text-sm text-red-600" role="alert">
          {error} <button onClick={reload} className="font-semibold underline">Reintentar</button>
        </p>
      )}
      {hasMore && !loading && (
        <button onClick={loadMore} className="mx-auto block rounded-full border border-[#133E37] px-5 py-2 text-sm font-semibold hover:bg-[#133E37] hover:text-white">
          Ver más
        </button>
      )}
    </div>
  )
}

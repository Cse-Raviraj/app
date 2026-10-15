export async function api(path, { method = 'GET', body, formData } = {}) {
  const opts = { method, headers: {} }
  if (formData) {
    opts.body = formData
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(path, opts)
  let data = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) throw new Error((data && data.error) || 'Something went wrong. Please try again.')
  return data
}

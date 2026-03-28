/**
 * uploadFiles - reliable multipart upload using fetch (bypasses axios Content-Type issues)
 * @param {File[]} files
 * @returns {Promise<{url: string, originalname: string, mimetype: string, size: number}[]>}
 */
export async function uploadFiles(files) {
  const token = localStorage.getItem('token')
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))

  const res = await fetch('/api/files/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Yükleme başarısız (${res.status})`)
  }

  const data = await res.json()
  return data.files || []
}

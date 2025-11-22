/**
 * Instagram API client (stub implementation)
 * 
 * Note: Instagram Graph API requires:
 * - Facebook Business account
 * - Instagram Business/Creator account
 * - App review and approval
 * 
 * This is a placeholder for future implementation
 */

const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || 'v21.0'
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`
const POLL_INTERVAL_MS = 1500
const MAX_POLLS = 10

export interface InstagramPostOptions {
  imageUrl: string
  caption: string
  accessToken: string
  instagramBusinessAccountId?: string
}

/**
 * Post image to Instagram (stub)
 */
export async function postToInstagram(
  options: InstagramPostOptions
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const igUserId =
    options.instagramBusinessAccountId ||
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

  if (!igUserId) {
    return {
      success: false,
      error:
        'Missing Instagram Business Account ID. Set INSTAGRAM_BUSINESS_ACCOUNT_ID in env.',
    }
  }

  try {
    const creationId = await createMediaContainer({
      igUserId,
      imageUrl: options.imageUrl,
      caption: options.caption,
      accessToken: options.accessToken,
    })

    await waitForContainerReady({
      creationId,
      accessToken: options.accessToken,
    })

    const postId = await publishMedia({
      igUserId,
      creationId,
      accessToken: options.accessToken,
    })

    return { success: true, postId }
  } catch (error) {
    console.error('Instagram publish failed', error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Instagram Graph API request failed',
    }
  }
}

/**
 * Validate Instagram access token (stub)
 */
export async function validateAccessToken(
  accessToken: string
): Promise<boolean> {
  if (!accessToken) return false
  try {
    const params = new URLSearchParams({
      fields: 'id',
      access_token: accessToken,
    })
    const response = await fetch(`${GRAPH_BASE_URL}/me?${params.toString()}`, {
      next: { revalidate: 0 },
    })
    const data = await response.json()
    if (!response.ok || data?.error) {
      return false
    }
    return Boolean(data?.id)
  } catch (error) {
    console.error('validateAccessToken error', error)
    return false
  }
}

async function createMediaContainer({
  igUserId,
  imageUrl,
  caption,
  accessToken,
}: {
  igUserId: string
  imageUrl: string
  caption: string
  accessToken: string
}) {
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  })

  const response = await fetch(`${GRAPH_BASE_URL}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await response.json()

  if (!response.ok || data?.error) {
    throw new Error(
      data?.error?.message || 'Failed to create Instagram media container'
    )
  }

  if (!data?.id) {
    throw new Error('Instagram response missing creation ID')
  }

  return data.id as string
}

async function waitForContainerReady({
  creationId,
  accessToken,
}: {
  creationId: string
  accessToken: string
}) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const params = new URLSearchParams({
      fields: 'status_code,status',
      access_token: accessToken,
    })
    const response = await fetch(
      `${GRAPH_BASE_URL}/${creationId}?${params.toString()}`,
      { next: { revalidate: 0 } }
    )
    const data = await response.json()

    if (!response.ok || data?.error) {
      throw new Error(
        data?.error?.message ||
          'Failed to check Instagram media container status'
      )
    }

    if (data?.status_code === 'FINISHED') {
      return
    }

    if (data?.status_code === 'ERROR') {
      throw new Error('Instagram media container reported an error status')
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('Timed out waiting for Instagram media container to finish')
}

async function publishMedia({
  igUserId,
  creationId,
  accessToken,
}: {
  igUserId: string
  creationId: string
  accessToken: string
}) {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  })

  const response = await fetch(`${GRAPH_BASE_URL}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await response.json()

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || 'Failed to publish Instagram media')
  }

  if (!data?.id) {
    throw new Error('Instagram response missing published media ID')
  }

  return data.id as string
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}


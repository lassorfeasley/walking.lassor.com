import { NextRequest, NextResponse } from 'next/server'

import { postToInstagram } from '@/lib/instagram/api'
import { createClient } from '@/lib/supabase/server'
import { PanoramaImage } from '@/types'

const DEFAULT_CAPTION = 'Walking Forward panorama'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', redirectTo: '/signin' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { imageId, caption } = body as {
      imageId?: string
      caption?: string
    }

    if (!imageId) {
      return NextResponse.json(
        { error: 'Missing imageId' },
        { status: 400 }
      )
    }

    const { data: image, error: imageError } = await supabase
      .from('panorama_images')
      .select('*')
      .eq('id', imageId)
      .single()

    if (imageError || !image) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      )
    }

    const panorama = image as PanoramaImage

    const { data: panelRows } = await supabase
      .from('panorama_panels')
      .select('panel_url, panel_order')
      .eq('panorama_image_id', panorama.id)
      .order('panel_order', { ascending: true })

    const panelImageUrls = (panelRows || [])
      .map((panel) => panel.panel_url)
      .filter((url): url is string => Boolean(url))
    const captionText =
      caption ||
      panorama.description ||
      panorama.title ||
      DEFAULT_CAPTION
    const imageUrl =
      panorama.processed_url ||
      panorama.preview_url ||
      panorama.thumbnail_url ||
      panorama.original_url

    if (!imageUrl && panelImageUrls.length === 0) {
      return NextResponse.json(
        { error: 'No usable image or panel URLs available for Instagram' },
        { status: 400 }
      )
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    const instagramBusinessAccountId =
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

    if (!accessToken || !instagramBusinessAccountId) {
      return NextResponse.json(
        {
          error:
            'Instagram integration not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID.',
        },
        { status: 500 }
      )
    }

    const result = await postToInstagram({
      imageUrl,
      panelImageUrls,
      caption: captionText,
      accessToken,
      instagramBusinessAccountId,
    })

    const now = new Date().toISOString()
    const historyPayload = {
      panorama_id: panorama.id,
      caption: captionText,
      status: result.success ? 'posted' : 'failed',
      instagram_post_id: result.postId,
      posted_by: user.id,
      posted_at: now,
      result_payload: result,
      error_message: result.error ?? null,
    }

    const { error: historyError } = await supabase
      .from('instagram_post_history')
      .insert(historyPayload)

    if (historyError) {
      console.error('Failed to log Instagram history', historyError)
    }

    if (result.success) {
      const updatePayload: Partial<PanoramaImage> = {
        status: 'posted',
        posted_at: now,
        instagram_post_id: result.postId,
        updated_at: now,
      }

      const { error: updateError } = await supabase
        .from('panorama_images')
        .update(updatePayload)
        .eq('id', panorama.id)

      if (updateError) {
        console.error('Failed to update panorama after posting', updateError)
      }
    }

    return NextResponse.json({
      success: result.success,
      postId: result.postId,
      error: result.error,
    })
  } catch (error) {
    console.error('Instagram post API failed', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

